import type { ExpenseEntry } from './types';

export type BudgetLevel = 'ok' | 'warn' | 'over';

/** Share of the budget at which a category turns amber */
export const WARN_RATIO = 0.8;

export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (budget <= 0) return 'ok';
  const ratio = spent / budget;
  if (ratio >= 1) return 'over';
  if (ratio >= WARN_RATIO) return 'warn';
  return 'ok';
}

export interface BudgetRow {
  category: string;
  spent: number;
  budget: number;
  /** spent / budget; above 1 when over */
  ratio: number;
  level: BudgetLevel;
}

/** One row per budgeted category, closest to (or furthest over) its limit first */
export function budgetRows(
  entries: ExpenseEntry[],
  budgets: Record<string, number>
): BudgetRow[] {
  const spentBy = new Map<string, number>();
  for (const e of entries) {
    spentBy.set(e.category, (spentBy.get(e.category) ?? 0) + e.amount);
  }
  return Object.entries(budgets)
    .map(([category, budget]) => {
      const spent = spentBy.get(category) ?? 0;
      return {
        category,
        spent,
        budget,
        ratio: spent / budget,
        level: budgetLevel(spent, budget)
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Straight-line estimate of the month's total from the pace so far */
export function projectMonthTotal(
  total: number,
  daysElapsed: number,
  daysInMonth: number
): number {
  if (daysElapsed <= 0) return total;
  if (daysElapsed >= daysInMonth) return total;
  return Math.round((total / daysElapsed) * daysInMonth);
}

/**
 * Whether saving `amount` deserves a budget alert: always while over budget,
 * and once when the category first crosses the warning line.
 */
export function budgetAlert(
  spentAfter: number,
  amount: number,
  budget: number
): BudgetLevel | null {
  const after = budgetLevel(spentAfter, budget);
  if (after === 'over') return 'over';
  if (after === 'warn' && budgetLevel(spentAfter - amount, budget) === 'ok') {
    return 'warn';
  }
  return null;
}
