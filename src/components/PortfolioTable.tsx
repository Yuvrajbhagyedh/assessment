"use client";

import { GainLoss } from "./GainLoss";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { PortfolioRow, SectorGroup } from "@/lib/types";

// Header labels may wrap onto two lines when space is tight: "Latest Earnings"
// is far wider than the numbers under it, and wrapping it is what lets all 11
// columns fit on a 1280px screen without scrolling.
const COLUMNS = [
  "Particulars",
  "Purchase Price",
  "Qty",
  "Investment",
  "Portfolio (%)",
  "NSE/BSE",
  "CMP",
  "Present Value",
  "Gain/Loss",
  "P/E Ratio",
  "Latest Earnings",
];

// Eleven columns of rupee amounts need about 1200px. On screens at least 1280px
// wide (Tailwind's `xl`) they fit, so we show a normal table. Below that, the
// same data is shown as one card per stock, so nothing ever scrolls sideways.
// Both layouts render from the same `sectors` prop - only the markup differs.
export function PortfolioTable({ sectors }: { sectors: SectorGroup[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm xl:block">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">Holdings grouped by sector</caption>
          <thead>
            <tr className="border-b border-slate-200">
              {COLUMNS.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={`bg-slate-50 px-3 py-2.5 align-bottom text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500 last:pr-4 ${
                    index === 0 ? "whitespace-nowrap pl-4 text-left" : "text-right"
                  }`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          {sectors.map((sector) => (
            <tbody key={sector.sector}>
              <SectorRow sector={sector} />
              {sector.rows.map((row) => (
                <StockRow key={`${row.code}-${row.exchange}`} row={row} />
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-6 xl:hidden">
        {sectors.map((sector) => (
          <section key={sector.sector} aria-label={sector.sector}>
            <SectorHeading sector={sector} />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {sector.rows.map((row) => (
                <StockCard key={`${row.code}-${row.exchange}`} row={row} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// ---------- Wide screens: table ----------

// Each sector opens with a shaded row carrying its totals, lined up under the
// same columns as the stock rows so they read as subtotals.
function SectorRow({ sector }: { sector: SectorGroup }) {
  return (
    <tr className="border-t border-slate-200 bg-slate-50">
      <th scope="rowgroup" className="whitespace-nowrap px-4 py-2.5 text-left">
        <span className="font-semibold text-slate-900">{sector.sector}</span>
        <span className="ml-2 text-xs font-normal text-slate-500">
          {holdingsLabel(sector.rows.length)}
        </span>
      </th>
      <td colSpan={2} />
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
        {formatCurrency(sector.investment)}
      </td>
      <td colSpan={3} />
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
        {formatCurrency(sector.presentValue)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <GainLoss value={sector.gainLoss} percent={sector.gainLossPercent} />
      </td>
      <td colSpan={2} />
    </tr>
  );
}

function StockRow({ row }: { row: PortfolioRow }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-2.5 text-left">
        <span className="font-medium text-slate-900">{row.name}</span>
        {row.error && <StaleBadge reason={row.error} />}
      </td>
      <Cell>{formatCurrency(row.purchasePrice)}</Cell>
      <Cell>{row.quantity}</Cell>
      <Cell>{formatCurrency(row.investment)}</Cell>
      <Cell>{formatPercent(row.portfolioPercent)}</Cell>
      <Cell>
        <ExchangeCode row={row} />
      </Cell>
      <Cell strong>{formatCurrency(row.cmp)}</Cell>
      <Cell strong>{formatCurrency(row.presentValue)}</Cell>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <GainLoss value={row.gainLoss} percent={row.gainLossPercent} />
      </td>
      <Cell>{formatNumber(row.peRatio)}</Cell>
      <Cell>{formatCurrency(row.latestEarnings)}</Cell>
    </tr>
  );
}

// Most numbers are secondary. `strong` marks the ones you actually scan for -
// today's price and what the holding is worth - so they stand out a little.
function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums last:pr-4 ${
        strong ? "font-medium text-slate-900" : "text-slate-600"
      }`}
    >
      {children}
    </td>
  );
}

// ---------- Narrower screens: cards ----------

function SectorHeading({ sector }: { sector: SectorGroup }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-slate-200 pb-2">
      <h3 className="text-sm font-semibold text-slate-900">
        {sector.sector}
        <span className="ml-2 text-xs font-normal text-slate-500">
          {holdingsLabel(sector.rows.length)}
        </span>
      </h3>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Invested</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatCurrency(sector.investment)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Value</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatCurrency(sector.presentValue)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Gain/Loss</dt>
          <dd>
            <GainLoss value={sector.gainLoss} percent={sector.gainLossPercent} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

// The same 11 fields as a table row, laid out top to bottom: who and what it's
// worth now at the top, the gain or loss beneath, the detail underneath that.
function StockCard({ row }: { row: PortfolioRow }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium text-slate-900">
            {row.name}
            {row.error && <StaleBadge reason={row.error} />}
          </h4>
          <div className="mt-1">
            <ExchangeCode row={row} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">CMP</p>
          <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(row.cmp)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Gain/Loss</span>
        <GainLoss value={row.gainLoss} percent={row.gainLossPercent} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Field label="Purchase Price" value={formatCurrency(row.purchasePrice)} />
        <Field label="Qty" value={String(row.quantity)} />
        <Field label="Investment" value={formatCurrency(row.investment)} />
        <Field label="Portfolio (%)" value={formatPercent(row.portfolioPercent)} />
        <Field label="Present Value" value={formatCurrency(row.presentValue)} />
        <Field label="P/E Ratio" value={formatNumber(row.peRatio)} />
        <Field label="Latest Earnings" value={formatCurrency(row.latestEarnings)} />
      </dl>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

// ---------- Shared by both layouts ----------

function ExchangeCode({ row }: { row: PortfolioRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-semibold tracking-wide text-slate-500">
        {row.exchange}
      </span>
      <span className="font-mono text-xs text-slate-600">{row.code}</span>
    </span>
  );
}

function StaleBadge({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 align-middle text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"
    >
      stale
    </span>
  );
}

function holdingsLabel(count: number): string {
  return count === 1 ? "1 holding" : `${count} holdings`;
}
