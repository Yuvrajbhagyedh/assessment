"use client";

import { PortfolioTable } from "@/components/PortfolioTable";
import { SummaryCards } from "@/components/SummaryCards";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatTime } from "@/lib/format";
import type { SectorGroup } from "@/lib/types";

// Yahoo is the preferred price source, but Google is used whenever Yahoo did
// not supply a price. Each row records which one it actually came from, so the
// heading reports what really happened instead of assuming Yahoo.
function describePriceSource(sectors: SectorGroup[]): string {
  const sources = new Set<string>();

  for (const sector of sectors) {
    for (const row of sector.rows) {
      if (row.cmpSource) sources.add(row.cmpSource);
    }
  }

  if (sources.size === 0) return "no source right now";
  if (sources.size > 1) return "Yahoo Finance and Google Finance";
  return sources.has("yahoo") ? "Yahoo Finance" : "Google Finance";
}

export default function Home() {
  const { data, error, isRefreshing, refresh } = usePortfolio();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Dashboard</h1>
          <p className="text-sm text-slate-500">
            Prices from{" "}
            {data ? describePriceSource(data.sectors) : "Yahoo or Google Finance"}
            , P/E and latest earnings from Google Finance. Checked every 15
            seconds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <span className="text-sm text-slate-500">
              Updated {formatTime(data.updatedAt)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — showing the last successful update.
        </p>
      )}

      {data && data.failedSymbols.length > 0 && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No live price for {data.failedSymbols.join(", ")}. Those rows are
          excluded from the gain/loss totals.
        </p>
      )}

      {!data && !error && <p className="text-slate-500">Loading portfolio…</p>}

      {data && (
        <div className="space-y-6">
          <SummaryCards total={data.total} />
          <PortfolioTable sectors={data.sectors} />
          <p className="text-xs text-slate-400">
            Figures are scraped from public web pages and may lag or differ from
            your broker. Not investment advice.
          </p>
        </div>
      )}
    </main>
  );
}
