import { data } from 'react-router';
import type { Route } from './+types/api.budget';
import { requireAuth } from '~/lib/auth.server';
import { getExpensesByMonth } from '~/lib/sheets.server';
import { getMasterData } from '~/lib/master.server';

// Spending vs budget for one category, checked by the Add page after a save
export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  const category = url.searchParams.get('category') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !category) {
    return data({ error: 'Invalid request' }, { status: 400 });
  }

  const [entries, master] = await Promise.all([
    getExpensesByMonth(month),
    getMasterData(),
  ]);
  const spent = entries
    .filter((e) => e.category === category)
    .reduce((sum, e) => sum + e.amount, 0);
  return data({ spent, budget: master.budgets[category] ?? 0 });
}
