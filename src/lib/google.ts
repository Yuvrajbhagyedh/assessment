import * as cheerio from "cheerio";
import { TtlCache } from "./cache";
import type { Exchange, PricePoint } from "./types";

// Google Finance has no API at all, so this reads the public quote page. Its
// class names are minified and regenerated on every deploy, so nothing here
// selects on them - we match the visible label text instead.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Fundamentals = {
  peRatio?: number;
  latestEarnings?: number;
};

// Price and fundamentals arrive on the same page but go stale at very different
// rates, so they are cached separately. There is no lightweight Google price
// endpoint - refreshing all 26 full pages costs ~7s and ~10MB - so 60s is the
// shortest interval this source can sustain without getting blocked.
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

// Above <main>, Google renders a "market movers" table that also contains price
// markup. Reading that gave every stock the Nifty value.
function mainSection($: cheerio.CheerioAPI) {
  const main = $("main");
  return main.length > 0 ? main : $("body");
}

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

type GoogleQuote = {
  price?: PricePoint;
  fundamentals: Fundamentals;
};

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

  // jsname attributes survive redesigns far better than minified class names.
  const scrapedPrice = toNumber(mainSection($).find('[jsname="Pdsbrc"]').first().text());

  // Google's "EPS" is what the spreadsheet calls Latest Earnings.
  const fundamentals: Fundamentals = {
    peRatio: toNumber(readStat($, "P/E ratio")),
    latestEarnings: toNumber(readStat($, "EPS")),
  };

  fundamentalsCache.set(key, fundamentals);

  // Only stamp a new time when Google actually returned a number, so a failed
  // parse never looks like a fresh price.
  let pricePoint = cachedPrice;
  if (scrapedPrice !== undefined) {
    pricePoint = { price: scrapedPrice, fetchedAt: new Date().toISOString() };
    priceCache.set(key, pricePoint);
  }

  return { price: pricePoint, fundamentals };
}
