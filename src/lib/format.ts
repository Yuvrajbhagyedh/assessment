const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | undefined): string {
  return value === undefined ? "—" : currency.format(value);
}

export function formatNumber(value: number | undefined): string {
  return value === undefined ? "—" : plain.format(value);
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(2)}%`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
