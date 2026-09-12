import { TtlCache } from "./cache";
import type { Exchange, PricePoint } from "./types";

// Yahoo has no public API. This is the endpoint their own site calls, and since
// mid-2023 it rejects anything without a session cookie plus a matching "crumb"
// token, so the handshake below reproduces what a browser does. fc.yahoo.com
// answers 404 on purpose - only its Set-Cookie header matters.

const QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote";
const CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb";
const COOKIE_URL = "https://fc.yahoo.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Yahoo tickers: NSE symbols get .NS, BSE scrip codes get .BO
export function toYahooSymbol(code: string, exchange: Exchange): string {
  return exchange === "NSE" ? `${code}.NS` : `${code}.BO`;
}

// One small request covers all 26 symbols, so this source can keep up with the
// dashboard's 15 second poll.
const PRICE_TTL_MS = 15_000;

// A 429 from Yahoo lasts minutes, not seconds, so retrying on the next poll just
// burns a doomed handshake every 15 seconds.
const FAILURE_BACKOFF_MS = 5 * 60_000;

const priceCache = new TtlCache<PricePoint>(PRICE_TTL_MS);

let session: { cookie: string; crumb: string } | null = null;
let skipUntil = 0;

async function openSession() {
  const cookieRes = await fetch(COOKIE_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });

  const setCookie = cookieRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("Yahoo did not return a session cookie");

  const cookie = setCookie.split(";")[0];

  const crumbRes = await fetch(CRUMB_URL, {
    headers: { "User-Agent": USER_AGENT, Cookie: cookie },
    cache: "no-store",
  });

  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes(" ")) {
    throw new Error(`Yahoo crumb request failed (${crumbRes.status})`);
  }

  session = { cookie, crumb };
  return session;
}

type YahooQuote = { symbol: string; regularMarketPrice?: number };

async function requestQuotes(symbols: string[], retry = true): Promise<YahooQuote[]> {
  const active = session ?? (await openSession());

  const url = `${QUOTE_URL}?symbols=${encodeURIComponent(symbols.join(","))}&crumb=${encodeURIComponent(active.crumb)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Cookie: active.cookie },
    cache: "no-store",
  });

  // 401 usually means the crumb expired; throw the session away and try once more.
  if ((res.status === 401 || res.status === 403) && retry) {
    session = null;
    return requestQuotes(symbols, false);
  }

  if (!res.ok) throw new Error(`Yahoo quote request failed (${res.status})`);

  const body = (await res.json()) as { quoteResponse?: { result?: YahooQuote[] } };
  return body.quoteResponse?.result ?? [];
}

export function isBackingOff(): boolean {
  return Date.now() < skipUntil;
}

// Symbols Yahoo cannot resolve are simply absent from the map, so one bad ticker
// cannot take the whole dashboard down.
export async function fetchCmp(symbols: string[]): Promise<Map<string, PricePoint>> {
  const prices = new Map<string, PricePoint>();

  const missing: string[] = [];
  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached !== undefined) prices.set(symbol, cached);
    else missing.push(symbol);
  }

  if (missing.length === 0) return prices;

  // Refused recently: hand back what is cached and let the caller use Google.
  if (isBackingOff()) return prices;

  try {
    // 20 tickers per request, so 26 holdings cost 2 calls rather than 26.
    for (let i = 0; i < missing.length; i += 20) {
      const chunk = missing.slice(i, i + 20);
      const quotes = await requestQuotes(chunk);
      const fetchedAt = new Date().toISOString();

      for (const quote of quotes) {
        if (typeof quote.regularMarketPrice !== "number") continue;

        const point: PricePoint = { price: quote.regularMarketPrice, fetchedAt };
        priceCache.set(quote.symbol, point);
        prices.set(quote.symbol, point);
      }
    }
  } catch (error) {
    // Remember the refusal so the next few polls skip Yahoo altogether.
    skipUntil = Date.now() + FAILURE_BACKOFF_MS;
    throw error;
  }

  return prices;
}
