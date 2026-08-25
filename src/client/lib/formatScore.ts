export function integerDisplayScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function formatScore(value: number): string {
  return integerDisplayScore(value).toLocaleString();
}
