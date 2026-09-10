import * as cheerio from "cheerio";
import { TtlCache } from "./cache";
import type { Exchange, PricePoint } from "./types";

// Google Finance has no API at all, so this reads the public quote page and
// pulls values out of the HTML.
//
// Two things make that survivable:
//   - the class names on the page are minified and change without warning, so
//     we never select on them. We find the *label* ("P/E ratio") and read its
//     sibling instead, which is tied to the visible text rather than the build.
//   - fundamentals move at most once a quarter, so a 10 minute cache is plenty
//     and keeps us from hammering Google every 15 seconds.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type Fundamentals = {
  peRatio?: number;
  latestEarnings?: number;
};

// The price and the fundamentals arrive on the same page, but they go stale at
// completely different rates, so they are cached separately.
//
// P/E and EPS only move when a company reports, so ten minutes costs nothing.
//
// The price is different, and this is the honest limit of the fallback:
// refreshing all 26 quote pages takes about 7 seconds and pulls roughly 10 MB of
// HTML, because there is no lightweight Google endpoint - only the full page. A
// 15 second price TTL would therefore mean scraping Google almost continuously,
// which would get us blocked and make the data *less* fresh, not more. Sixty
// seconds is the shortest interval this source can sustain.
//
// Yahoo has no such problem - one small request covers every symbol - so when
// Yahoo is reachable the price really does refresh every 15 seconds. See
// PRICE_TTL_MS in yahoo.ts.
const PRICE_TTL_MS = 60_000;
const FUNDAMENTALS_TTL_MS = 10 * 60_000;

const priceCache = new TtlCache<PricePoint>(PRICE_TTL_MS);
const fundamentalsCache = new TtlCache<Fundamentals>(FUNDAMENTALS_TTL_MS);

// Google uses its own exchange suffixes: NSE stays NSE, BSE becomes BOM.
function quoteUrl(code: string, exchange: Exchange) {
  const suffix = exchange === "NSE" ? "NSE" : "BOM";
  return `https://www.google.com/finance/quote/${code}:${suffix}`;
}

// "₹1,020.50" -> 1020.5, "13.49" -> 13.49, "-" -> undefined
function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-") return undefined;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

// Everything we want lives inside the page's single <main> element. Scoping to
// it matters: above <main> Google renders a "market movers" table that also
// contains price markup, and reading that gave every stock the Nifty value.
function mainSection($: cheerio.CheerioAPI) {
  const main = $("main");
  return main.length > 0 ? main : $("body");
}

// Finds the stat box whose label is exactly `label` and returns the text of the
// value sitting next to it.
function readStat($: cheerio.CheerioAPI, label: string): string | undefined {
  let value: string | undefined;

  mainSection($).find("div").each((_, element) => {
    const node = $(element);

    // Only look at leaf divs, otherwise every ancestor matches too.
    if (node.children().length > 0) return;
    if (node.text().trim() !== label) return;

    const sibling = node.next().text().trim();
    if (sibling) {
      value = sibling;
      return false; // stop iterating
    }
  });

  return value;
}

export type GoogleQuote = {
  price?: PricePoint;
  fundamentals: Fundamentals;
};

// Fetches one Google quote page, but only when something it provides has
// actually expired. If both caches are still warm we never touch the network.
export async function fetchQuote(
  code: string,
  exchange: Exchange
): Promise<GoogleQuote> {
  const key = `${code}:${exchange}`;

  const cachedPrice = priceCache.get(key);
  const cachedFundamentals = fundamentalsCache.get(key);

  if (cachedPrice && cachedFundamentals) {
    return { price: cachedPrice, fundamentals: cachedFundamentals };
  }

  const res = await fetch(quoteUrl(code, exchange), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Google Finance returned ${res.status}`);

  const $ = cheerio.load(await res.text());

  // The headline price carries a jsname attribute, which survives redesigns far
  // better than the minified class names around it. Inside <main> the first one
  // is always the stock being viewed.
  const price = toNumber(mainSection($).find('[jsname="Pdsbrc"]').first().text());

  // Google labels trailing EPS as "EPS" - that is the "latest earnings" figure
  // the spreadsheet tracks (earnings per share, not total profit).
  const fundamentals: Fundamentals = {
    peRatio: toNumber(readStat($, "P/E ratio")),
    latestEarnings: toNumber(readStat($, "EPS")),
  };

  fundamentalsCache.set(key, fundamentals);

  // Only stamp a new timestamp when Google actually gave us a number. If the
  // price could not be parsed we keep the previous one - which is either still
  // within its TTL, or undefined - rather than pretending it just refreshed.
  let point = cachedPrice;
  if (price !== undefined) {
    point = { price, fetchedAt: new Date().toISOString() };
    priceCache.set(key, point);
  }

  return { price: point, fundamentals };
}
