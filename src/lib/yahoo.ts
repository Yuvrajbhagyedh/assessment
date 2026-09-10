import { TtlCache } from "./cache";
import type { Exchange, PricePoint } from "./types";

// Yahoo has no public/documented API for quotes. The endpoint below is the one
// their own website calls. Since mid-2023 it refuses requests that do not carry
// a session cookie plus a matching "crumb" token, so we reproduce that handshake:
//
//   1. hit fc.yahoo.com, which sets an A3 cookie (it answers 404 - that's fine,
//      we only want the Set-Cookie header)
//   2. exchange that cookie for a crumb
//   3. send both on every quote request
//
// The crumb is valid for a while, so we hold on to it and only re-fetch when a
// request comes back unauthorised.

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

// Yahoo answers all 26 symbols in one small request, so it can comfortably be
// refreshed at the dashboard's 15 second poll interval. This is the source that
// actually satisfies the "update every 15 seconds" requirement.
const PRICE_TTL_MS = 15_000;

// When Yahoo turns us away - usually 429 Too Many Requests - retrying on the
// very next poll is pointless: the block lasts minutes, not seconds. We note the
// time and skip Yahoo entirely until it passes, instead of spending a doomed
// cookie/crumb handshake every 15 seconds.
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

  // "A3=abc; Expires=...; Path=/" -> "A3=abc"
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

// True while we are deliberately not calling Yahoo after a refusal.
export function isBackingOff(): boolean {
  return Date.now() < skipUntil;
}

// Returns a symbol -> price map. Symbols Yahoo could not resolve are simply
// absent from the map rather than throwing, so one bad ticker cannot take the
// whole dashboard down.
export async function fetchCmp(symbols: string[]): Promise<Map<string, PricePoint>> {
  const prices = new Map<string, PricePoint>();

  const missing: string[] = [];
  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached !== undefined) prices.set(symbol, cached);
    else missing.push(symbol);
  }

  if (missing.length === 0) return prices;

  // Yahoo refused us recently. Hand back whatever is still cached and let the
  // caller fall back to Google, without another wasted round trip.
  if (isBackingOff()) return prices;

  try {
    // One request per 20 tickers instead of one per ticker - 26 holdings become
    // 2 calls, which keeps us well under Yahoo's rate limit.
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
