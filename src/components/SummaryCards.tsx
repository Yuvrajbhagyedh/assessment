import { formatCurrency } from "@/lib/format";
import type { PortfolioResponse } from "@/lib/types";
import { PercentPill, signedCurrency, toneClass } from "./GainLoss";

// One panel split into three figures, read left to right as a sentence: what
// was put in, what it is worth now, and the difference.
export function SummaryCards({ total }: { total: PortfolioResponse["total"] }) {
  return (
    <div className="grid divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat label="Total investment">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
          {formatCurrency(total.investment)}
        </p>
      </Stat>

      <Stat label="Present value">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
          {formatCurrency(total.presentValue)}
        </p>
      </Stat>

      <Stat label="Overall gain / loss">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            className={`text-2xl font-semibold tracking-tight tabular-nums ${toneClass(total.gainLoss)}`}
          >
            {signedCurrency(total.gainLoss)}
          </p>
          <PercentPill value={total.gainLossPercent} />
        </div>
      </Stat>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 sm:py-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
