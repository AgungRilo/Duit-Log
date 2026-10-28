import { sheetDateToIso } from './dates';
import type { OpeningBalance } from './master';
import type { TransferEntry } from './transfers';
import type { ExpenseEntry } from './types';

export interface PocketBalance {
  method: string;
  opening: number;
  since: string | null;
  in: number;
  out: number;
  balance: number;
}

/**
 * Running balance per method that has an opening balance: the opening amount
 * plus income and transfers in, minus spending and transfers out, for entries
 * dated from the opening date (inclusive) up to `until` (inclusive).
 * Entries with unreadable dates are skipped.
 */
export function pocketBalances(
  openings: Record<string, OpeningBalance>,
  expenses: ExpenseEntry[],
  income: ExpenseEntry[],
  transfers: TransferEntry[],
  until: string
): PocketBalance[] {
  const pockets = new Map<string, PocketBalance>(
    Object.entries(openings).map(([method, o]) => [
      method,
      { method, opening: o.amount, since: o.since, in: 0, out: 0, balance: 0 }
    ])
  );

  const add = (method: string, date: string, amount: number) => {
    const pocket = pockets.get(method);
    const iso = sheetDateToIso(date);
    if (!pocket || !iso || iso > until) return;
    if (pocket.since && iso < pocket.since) return;
    if (amount >= 0) pocket.in += amount;
    else pocket.out -= amount;
  };

  for (const e of income) add(e.method, e.date, e.amount);
  for (const e of expenses) add(e.method, e.date, -e.amount);
  for (const t of transfers) {
    add(t.to, t.date, t.amount);
    add(t.from, t.date, -t.amount);
  }

  return [...pockets.values()].map((p) => ({
    ...p,
    balance: p.opening + p.in - p.out
  }));
}
