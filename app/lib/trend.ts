import type { ExpenseEntry } from './types';

export const TREND_MONTHS = 6;

/** Spending per source × category, compact enough to send several months */
export interface MonthSummary {
  month: string;
  /** [source, category, amount] */
  rows: [string, string, number][];
}

// Matches the dashboard, which groups blank sources as "Unknown"
const sourceOf = (e: ExpenseEntry) => e.source || 'Unknown';

export function summarizeMonth(
  month: string,
  entries: ExpenseEntry[]
): MonthSummary {
  const totals = new Map<string, [string, string, number]>();
  for (const e of entries) {
    const category = e.category || 'Unknown';
    const key = `${sourceOf(e)}\u0000${category}`;
    const row = totals.get(key) ?? [sourceOf(e), category, 0];
    row[2] += e.amount;
    totals.set(key, row);
  }
  return { month, rows: [...totals.values()] };
}

/** Up to `count` existing month tabs ending at `activeMonth`, oldest first */
export function trendMonths(
  months: string[],
  activeMonth: string,
  count = TREND_MONTHS
): string[] {
  return months
    .filter((m) => m <= activeMonth)
    .sort()
    .slice(-count);
}

const matches = (source: string, filter: string) =>
  filter === 'All' || source === filter;

export function monthTotal(s: MonthSummary, source = 'All'): number {
  return s.rows.reduce(
    (sum, [src, , amount]) => (matches(src, source) ? sum + amount : sum),
    0
  );
}

export function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

/** Percent change of `value` against `base`, or null without a usable base */
export function percentChange(value: number, base: number | null): number | null {
  return base && base > 0 ? ((value - base) / base) * 100 : null;
}

export interface CategoryTrend {
  category: string;
  /** One value per summary, oldest first */
  values: number[];
  current: number;
  /** Average of the months before the current one */
  avgBefore: number | null;
  change: number | null;
}

/**
 * Per-category totals across the summaries (the last one is the current
 * month), biggest categories over the whole period first.
 */
export function categoryTrends(
  summaries: MonthSummary[],
  source = 'All',
  limit = 5
): CategoryTrend[] {
  const byCategory = new Map<string, number[]>();
  summaries.forEach((s, i) => {
    for (const [src, category, amount] of s.rows) {
      if (!matches(src, source)) continue;
      const values =
        byCategory.get(category) ?? Array.from({ length: summaries.length }, () => 0);
      values[i] += amount;
      byCategory.set(category, values);
    }
  });
  return [...byCategory.entries()]
    .map(([category, values]) => {
      const current = values[values.length - 1] ?? 0;
      const avgBefore = average(values.slice(0, -1));
      return {
        category,
        values,
        current,
        avgBefore,
        change: percentChange(current, avgBefore)
      };
    })
    .sort(
      (a, b) =>
        b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0)
    )
    .slice(0, limit);
}

/** Every source seen in the summaries, by total spending */
export function trendSources(summaries: MonthSummary[]): string[] {
  const totals = new Map<string, number>();
  for (const s of summaries) {
    for (const [src, , amount] of s.rows) {
      totals.set(src, (totals.get(src) ?? 0) + amount);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
