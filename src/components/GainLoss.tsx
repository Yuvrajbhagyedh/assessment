import { formatCurrency, formatPercent } from "@/lib/format";

// Gains are green, losses red, no price grey. The table rows, the sector rows
// and the summary panel all go through these helpers, so the rule can never
// drift between them.
export function toneClass(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-600";
}

// A leading "+" makes a gain as easy to spot as the minus sign on a loss.
export function signedCurrency(value: number): string {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}

// The percentage change as a small pill. The arrow repeats the direction, so it
// still reads correctly for anyone who can't tell red from green.
export function PercentPill({ value }: { value: number }) {
  const style =
    value > 0
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : value < 0
        ? "bg-rose-50 text-rose-700 ring-rose-600/20"
        : "bg-slate-100 text-slate-600 ring-slate-500/20";

  return (
    <span
      className={`inline-flex min-w-[4.75rem] items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset ${style}`}
    >
      {value !== 0 && (
        <span aria-hidden="true" className="text-[8px]">
          {value > 0 ? "▲" : "▼"}
        </span>
      )}
      <span className="sr-only">{value > 0 ? "up" : value < 0 ? "down" : ""}</span>
      {formatPercent(Math.abs(value))}
    </span>
  );
}

type Props = {
  value: number | undefined;
  percent?: number;
};

export function GainLoss({ value, percent }: Props) {
  if (value === undefined) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className={`font-medium tabular-nums ${toneClass(value)}`}>
        {signedCurrency(value)}
      </span>
      {percent !== undefined && <PercentPill value={percent} />}
    </span>
  );
}
