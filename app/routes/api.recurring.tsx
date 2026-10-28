import { data } from 'react-router';
import type { Route } from './+types/api.recurring';
import { requireAuth } from '~/lib/auth.server';
import {
  appendExpenses,
  ensureMonthSheet,
  getExpensesByMonth,
} from '~/lib/sheets.server';
import { getMasterData } from '~/lib/master.server';
import { getRecurringItems } from '~/lib/recurring.server';
import { billLogDate, pendingBills } from '~/lib/recurring';
import { jakartaTimestamp, jakartaToday } from '~/lib/dates';
import { log } from '~/lib/logger.server';
import type { ExpenseEntry } from '~/lib/types';

function parseMonth(value: unknown): string {
  const month = String(value ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw data('Invalid month', { status: 400 });
  }
  return month;
}

// A month without a tab yet simply has no entries
async function entriesFor(month: string): Promise<ExpenseEntry[]> {
  try {
    return await getExpensesByMonth(month);
  } catch (err) {
    if ((err as Error).message.includes('Unable to parse range')) return [];
    throw err;
  }
}

async function loadBills(month: string) {
  const [items, entries, master] = await Promise.all([
    getRecurringItems(),
    entriesFor(month),
    getMasterData(),
  ]);
  return pendingBills(items, entries, month, jakartaToday(), master);
}

/** Bills from the Recurring tab not yet logged in `month` */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const month = parseMonth(new URL(request.url).searchParams.get('month'));
  return data({ month, bills: await loadBills(month), logged: [] as string[] });
}

/**
 * Logs the given bills (`ids`, comma-separated) into `month`. Pending bills
 * are recomputed first, so a double tap can't log the same bill twice.
 */
export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const month = parseMonth(formData.get('month'));
  const ids = new Set(
    String(formData.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter(Number.isInteger),
  );

  const bills = await loadBills(month);
  const toLog = bills.filter((b) => ids.has(b.id) && !b.problem);
  if (toLog.length === 0) {
    return data({ month, bills, logged: [] as string[] });
  }

  const today = jakartaToday();
  const timestamp = jakartaTimestamp();
  await ensureMonthSheet(month);
  await appendExpenses(
    month,
    toLog.map((b) => [
      timestamp,
      b.item,
      b.category,
      String(b.amount),
      b.method,
      billLogDate(b, month, today),
      b.source,
    ]),
  );
  log('info', 'recurring_logged', { month, count: String(toLog.length) });

  const loggedIds = new Set(toLog.map((b) => b.id));
  return data({
    month,
    bills: bills.filter((b) => !loggedIds.has(b.id)),
    logged: toLog.map((b) => b.item),
  });
}
