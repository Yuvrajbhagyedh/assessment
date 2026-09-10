"use client";

import { GainLoss } from "./GainLoss";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { PortfolioRow, SectorGroup } from "@/lib/types";

const COLUMNS = [
  "Particulars",
  "Purchase Price",
  "Qty",
  "Investment",
  "Portfolio (%)",
  "NSE/BSE",
  "CMP",
  "Present Value",
  "Gain / Loss",
  "P/E Ratio",
  "Latest Earnings",
];

export function PortfolioTable({ sectors }: { sectors: SectorGroup[] }) {
  return (
    // The table is wider than a phone screen, so it scrolls sideways inside
    // this wrapper instead of stretching the whole page.
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {COLUMNS.map((column, index) => (
              <th
                key={column}
                className={`whitespace-nowrap px-3 py-2 font-medium text-slate-600 ${
                  index === 0 ? "text-left" : "text-right"
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>

        {sectors.map((sector) => (
          <tbody key={sector.sector} className="border-b border-slate-200 last:border-0">
            <SectorHeader sector={sector} />
            {sector.rows.map((row) => (
              <StockRow key={`${row.code}-${row.exchange}`} row={row} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function SectorHeader({ sector }: { sector: SectorGroup }) {
  return (
    <tr className="bg-slate-100/80">
      <th className="px-3 py-2 text-left font-semibold text-slate-800">
        {sector.sector}
      </th>
      <td colSpan={2} />
      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-700">
        {formatCurrency(sector.investment)}
      </td>
      <td colSpan={3} />
      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-700">
        {formatCurrency(sector.presentValue)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <GainLoss value={sector.gainLoss} percent={sector.gainLossPercent} />
      </td>
      <td colSpan={2} />
    </tr>
  );
}

function StockRow({ row }: { row: PortfolioRow }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="whitespace-nowrap px-3 py-2 text-left">
        <span className="text-slate-900">{row.name}</span>
        {row.error && (
          <span
            title={row.error}
            className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700"
          >
            stale
          </span>
        )}
      </td>
      <Cell>{formatCurrency(row.purchasePrice)}</Cell>
      <Cell>{row.quantity}</Cell>
      <Cell>{formatCurrency(row.investment)}</Cell>
      <Cell>{formatPercent(row.portfolioPercent)}</Cell>
      <Cell>
        <span className="text-slate-500">{row.exchange}</span> {row.code}
      </Cell>
      <Cell>{formatCurrency(row.cmp)}</Cell>
      <Cell>{formatCurrency(row.presentValue)}</Cell>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <GainLoss value={row.gainLoss} percent={row.gainLossPercent} />
      </td>
      <Cell>{formatNumber(row.peRatio)}</Cell>
      <Cell>{formatCurrency(row.latestEarnings)}</Cell>
    </tr>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
      {children}
    </td>
  );
}
