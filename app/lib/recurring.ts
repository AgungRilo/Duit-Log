import { daysInMonth } from './dates';
import { parseBudget } from './master';
import type { MasterData } from './master';
import type { ExpenseEntry } from './types';

export const RECURRING_HEADERS = [
  'Item',
  'Category',
  'Amount',
  'Method',
  'Source',
  'Day',
  'Active'
];

/** A row of the `Recurring` tab */
export interface RecurringItem {
  /** Sheet row number, stable enough to identify the bill in one request */
  id: number;
  item: string;
  category: string;
  amount: number;
  method: string;
  source: string;
  /** Day of month the bill is due (1–31) */
  day: number;
}

export interface PendingBill extends RecurringItem {
  /** "YYYY-MM-DD", clamped to the month's last day */
  dueDate: string;
  overdue: boolean;
  /** Set when the row can't be logged as is (e.g. unknown category) */
  problem?: string;
}

const INACTIVE = new Set(['false', 'no', 'n', '0', 'tidak', 'off']);

function cellText(cell: unknown): string {
  return String(cell ?? '').trim();
}

const normalize = (item: string) => item.trim().toLowerCase();

/** Parses `Recurring` rows (header included); skips inactive or incomplete ones */
export function parseRecurringRows(rows: unknown[][]): RecurringItem[] {
  const items: RecurringItem[] = [];
  rows.slice(1).forEach((row, i) => {
    const [item, category, amount, method, source, day, active] = row;
    if (active === false || INACTIVE.has(cellText(active).toLowerCase())) return;
    const name = cellText(item);
    const value = parseBudget(amount);
    if (!name || value <= 0) return;
    const d = Math.trunc(Number(day));
    items.push({
      id: i + 2,
      item: name,
      category: cellText(category),
      amount: value,
      method: cellText(method),
      source: cellText(source),
      day: d >= 1 && d <= 31 ? d : 1
    });
  });
  return items;
}

function problemFor(item: RecurringItem, master: MasterData): string | undefined {
  if (!master.categories.includes(item.category)) {
    return item.category ? `Unknown category "${item.category}"` : 'Missing category';
  }
  if (!master.methods.includes(item.method)) {
    return item.method ? `Unknown method "${item.method}"` : 'Missing method';
  }
  if (!master.sources.includes(item.source)) {
    return item.source ? `Unknown source "${item.source}"` : 'Missing source';
  }
  return undefined;
}

/**
 * Bills not yet logged in `month`, soonest due first. A bill counts as logged
 * when the month has an entry with the same item name (ignoring case), so a
 * bill whose amount changed is still recognised.
 */
export function pendingBills(
  items: RecurringItem[],
  entries: ExpenseEntry[],
  month: string,
  today: string,
  master: MasterData
): PendingBill[] {
  const logged = new Set(entries.map((e) => normalize(e.item)));
  const lastDay = daysInMonth(month);
  return items
    .filter((it) => !logged.has(normalize(it.item)))
    .map((it) => {
      const dueDate = `${month}-${String(Math.min(it.day, lastDay)).padStart(2, '0')}`;
      return {
        ...it,
        dueDate,
        overdue: dueDate < today,
        problem: problemFor(it, master)
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
}

/** Date to log a bill under: today within the current month, else its due date */
export function billLogDate(bill: PendingBill, month: string, today: string): string {
  return today.startsWith(month) ? today : bill.dueDate;
}
