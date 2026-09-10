import { formatCurrency, formatPercent } from "@/lib/format";

type Props = {
  value: number | undefined;
  percent?: number;
};

// Green for a gain, red for a loss, grey when we have no price. Kept in one
// place so the rule is identical in the table, the sector rows and the summary.
export function GainLoss({ value, percent }: Props) {
  if (value === undefined) return <span className="text-slate-400">—</span>;

  const tone =
    value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-600";

  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {formatCurrency(value)}
      {percent !== undefined && (
        <span className="ml-1 text-xs font-normal opacity-80">
          ({formatPercent(percent)})
        </span>
      )}
    </span>
  );
}
