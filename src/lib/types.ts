export type Exchange = "NSE" | "BSE";

// One row as it exists in the source spreadsheet. Nothing here changes at runtime.
export type Holding = {
  name: string;
  sector: string;
  exchange: Exchange;
  code: string;
  purchasePrice: number;
  quantity: number;
};

// A price together with the moment its source actually handed it to us. The
// timestamp travels with the number so we never report a price as fresher than
// it really is.
export type PricePoint = {
  price: number;
  fetchedAt: string;
};

export type PriceSource = "yahoo" | "google";

// What we manage to scrape for a single stock. Every field is optional because
// any one of the two sources can fail on its own.
export type Quote = {
  cmp?: number;
  cmpSource?: PriceSource;
  cmpAsOf?: string;
  peRatio?: number;
  latestEarnings?: number;
  error?: string;
};

export type PortfolioRow = Holding & {
  investment: number;
  portfolioPercent: number;
  cmp?: number;
  cmpSource?: PriceSource;
  cmpAsOf?: string;
  presentValue?: number;
  gainLoss?: number;
  gainLossPercent?: number;
  peRatio?: number;
  latestEarnings?: number;
  error?: string;
};

export type SectorGroup = {
  sector: string;
  rows: PortfolioRow[];
  investment: number;
  presentValue: number;
  gainLoss: number;
  gainLossPercent: number;
};

export type PortfolioResponse = {
  sectors: SectorGroup[];
  total: {
    investment: number;
    presentValue: number;
    gainLoss: number;
    gainLossPercent: number;
  };
  updatedAt: string;
  failedSymbols: string[];
};
