"use client";

import { PortfolioTable } from "@/components/PortfolioTable";
import { SummaryCards } from "@/components/SummaryCards";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatTime } from "@/lib/format";
import type { SectorGroup } from "@/lib/types";

// Rows record which source their price came from, so the heading never assumes
// Yahoo when Google actually supplied it.
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

  const holdingCount = data
    ? data.sectors.reduce((count, sector) => count + sector.rows.length, 0)
    : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Portfolio Dashboard
            </h1>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <MetaItem
                label="Prices"
                value={data ? describePriceSource(data.sectors) : "Yahoo or Google Finance"}
              />
              <MetaItem label="P/E and latest earnings" value="Google Finance" />
              <MetaItem label="Checked" value="every 15 seconds" />
            </dl>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {data && (
              <p className="text-[13px] text-slate-500">
                Last checked{" "}
                <time dateTime={data.updatedAt} className="font-medium tabular-nums text-slate-700">
                  {formatTime(data.updatedAt)}
                </time>
              </p>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon spinning={isRefreshing} />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error} — showing the last successful update.
          </p>
        )}

        {data && data.unpricedHoldings.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No live price for {data.unpricedHoldings.join(", ")}. Those rows are
            excluded from the gain/loss totals.
          </p>
        )}

        {!data && !error && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">Loading portfolio…</p>
            <p className="mt-1 text-sm text-slate-500">
              The first load fetches a live quote for every holding and can take
              around 10 seconds.
            </p>
          </div>
        )}

        {data && (
          <>
            <SummaryCards total={data.total} />

            <section aria-labelledby="holdings-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="holdings-heading" className="text-base font-semibold text-slate-900">
                  Holdings
                </h2>
                <p className="text-[13px] text-slate-500">
                  {holdingCount} holdings across {data.sectors.length} sectors
                </p>
              </div>
              <PortfolioTable sectors={data.sectors} />
            </section>

            <p className="text-xs leading-relaxed text-slate-400">
              Figures are scraped from public web pages and may lag or differ from
              your broker. Not investment advice.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 ${spinning ? "motion-safe:animate-spin" : ""}`}
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.5 3.5v3.2h-3.2" />
    </svg>
  );
}
