import holdingsJson from "../../data/holdings.json";
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

// More Google pages in flight than this and it starts throttling us.
const GOOGLE_BATCH_SIZE = 4;

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

    const chosenPrice = yahooPrice ?? googlePrice;
    const cmpSource = yahooPrice ? "yahoo" : googlePrice ? "google" : undefined;

    return {
      cmp: chosenPrice?.price,
      cmpSource,
      cmpAsOf: chosenPrice?.fetchedAt,
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

  // A missing price stays undefined, never 0: a 0 would read as a 100% loss.
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

    // Unpriced holdings count at cost, so they read as flat rather than wiped out.
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
  const symbols = holdings.map((holding) =>
    toYahooSymbol(holding.code, holding.exchange)
  );

  // Yahoo down: carry on with no prices and let the Google fallback fill in.
  let prices = new Map<string, PricePoint>();
  try {
    prices = await fetchCmp(symbols);
  } catch {
    prices = new Map();
  }

  const quotes: Quote[] = [];
  for (let i = 0; i < holdings.length; i += GOOGLE_BATCH_SIZE) {
    const batch = holdings.slice(i, i + GOOGLE_BATCH_SIZE);
    const loaded = await Promise.all(
      batch.map((holding) =>
        loadQuote(holding, prices.get(toYahooSymbol(holding.code, holding.exchange)))
      )
    );
    quotes.push(...loaded);
  }

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
