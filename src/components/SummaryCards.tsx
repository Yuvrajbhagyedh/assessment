import { formatCurrency, formatPercent } from "@/lib/format";
import type { PortfolioResponse } from "@/lib/types";

export function SummaryCards({ total }: { total: PortfolioResponse["total"] }) {
  const isGain = total.gainLoss >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card label="Total Investment" value={formatCurrency(total.investment)} />
      <Card label="Present Value" value={formatCurrency(total.presentValue)} />
      <Card
        label="Overall Gain / Loss"
        value={formatCurrency(total.gainLoss)}
        hint={formatPercent(total.gainLossPercent)}
        tone={isGain ? "text-emerald-600" : "text-red-600"}
      />
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className={`text-sm ${tone}`}>{hint}</p>}
    </div>
  );
}
