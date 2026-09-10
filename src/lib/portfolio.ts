import holdingsJson from "../../data/holdings.json";
import { mapWithLimit } from "./cache";
import { fetchQuote } from "./google";
import { fetchCmp, toYahooSymbol } from "./yahoo";
import type {
  Holding,
  PortfolioResponse,
  PortfolioRow,
  PricePoint,
  Quote,
  SectorGroup,
} from "./types";

const holdings = holdingsJson as Holding[];

// Investment and portfolio weight come straight from the spreadsheet and never
// change, so they are computed once when the module loads.
const totalInvestment = holdings.reduce(
  (sum, holding) => sum + holding.purchasePrice * holding.quantity,
  0
);

async function loadQuote(holding: Holding, yahooPrice?: PricePoint): Promise<Quote> {
  try {
    const { price: googlePrice, fundamentals } = await fetchQuote(
      holding.code,
      holding.exchange
    );

    // Yahoo stays the preferred source. Google's price is only used when Yahoo
    // did not supply one, so the table still shows something useful.
    const price = yahooPrice ?? googlePrice;

    return {
      cmp: price?.price,
      cmpSource: yahooPrice ? "yahoo" : googlePrice ? "google" : undefined,
      // The timestamp comes from the price itself, so it reports when the source
      // really produced the number - not when this request happened to run.
      cmpAsOf: price?.fetchedAt,
      peRatio: fundamentals.peRatio,
      latestEarnings: fundamentals.latestEarnings,
    };
  } catch (error) {
    // A failed scrape for one stock must not blank out the other 25.
    return {
      cmp: yahooPrice?.price,
      cmpSource: yahooPrice ? "yahoo" : undefined,
      cmpAsOf: yahooPrice?.fetchedAt,
      error: error instanceof Error ? error.message : "Failed to load stock data",
    };
  }
}

function buildRow(holding: Holding, quote: Quote): PortfolioRow {
  const investment = holding.purchasePrice * holding.quantity;

  const row: PortfolioRow = {
    ...holding,
    investment,
    portfolioPercent: (investment / totalInvestment) * 100,
    cmpSource: quote.cmpSource,
    cmpAsOf: quote.cmpAsOf,
    peRatio: quote.peRatio,
    latestEarnings: quote.latestEarnings,
    error: quote.error,
  };

  // Everything below depends on a live price. Without one we leave the fields
  // undefined and the table renders a dash rather than a misleading zero.
  if (typeof quote.cmp === "number") {
    const presentValue = quote.cmp * holding.quantity;

    row.cmp = quote.cmp;
    row.presentValue = presentValue;
    row.gainLoss = presentValue - investment;
    row.gainLossPercent = ((presentValue - investment) / investment) * 100;
  }

  return row;
}

function groupBySector(rows: PortfolioRow[]): SectorGroup[] {
  const groups = new Map<string, PortfolioRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.sector);
    if (existing) existing.push(row);
    else groups.set(row.sector, [row]);
  }

  return [...groups.entries()].map(([sector, sectorRows]) => {
    const investment = sectorRows.reduce((sum, row) => sum + row.investment, 0);

    // Only sum stocks we actually priced, so a failed scrape does not read as
    // a loss the size of that holding.
    const presentValue = sectorRows.reduce(
      (sum, row) => sum + (row.presentValue ?? row.investment),
      0
    );

    return {
      sector,
      rows: sectorRows,
      investment,
      presentValue,
      gainLoss: presentValue - investment,
      gainLossPercent: ((presentValue - investment) / investment) * 100,
    };
  });
}

export async function getPortfolio(): Promise<PortfolioResponse> {
  const symbols = holdings.map((h) => toYahooSymbol(h.code, h.exchange));

  // If Yahoo is down entirely we carry on with an empty price map and let the
  // Google fallback inside loadQuote fill the gap.
  let prices = new Map<string, PricePoint>();
  try {
    prices = await fetchCmp(symbols);
  } catch {
    prices = new Map();
  }

  // Four Google pages in flight at a time. Higher is faster but starts getting
  // us throttled; lower makes a cold load noticeably slow.
  const quotes = await mapWithLimit(holdings, 4, (holding) =>
    loadQuote(holding, prices.get(toYahooSymbol(holding.code, holding.exchange)))
  );

  const rows = holdings.map((holding, index) => buildRow(holding, quotes[index]));
  const sectors = groupBySector(rows);

  const presentValue = sectors.reduce((sum, sector) => sum + sector.presentValue, 0);

  return {
    sectors,
    total: {
      investment: totalInvestment,
      presentValue,
      gainLoss: presentValue - totalInvestment,
      gainLossPercent: ((presentValue - totalInvestment) / totalInvestment) * 100,
    },
    updatedAt: new Date().toISOString(),
    failedSymbols: rows.filter((row) => row.cmp === undefined).map((row) => row.name),
  };
}
