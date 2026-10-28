import { useState } from 'react';
import {
  data,
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/dashboard';
import { getExpensesByMonth } from '~/lib/sheets.server';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth } from '~/lib/month.server';
import { selectedMonthCookie } from '~/lib/cookies.server';
import type { ExpenseEntry } from '~/lib/types';
import { MonthSelector } from '~/components/month-selector';
import { dayOfMonth, previousMonth } from '~/lib/dates';
import { getMasterData } from '~/lib/master.server';
import {
  budgetLevel,
  budgetRows,
  projectMonthTotal,
  type BudgetLevel,
  type BudgetRow,
} from '~/lib/budget';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month');
  const cookieMonth = await selectedMonthCookie.parse(
    request.headers.get('Cookie'),
  );

  const [{ months, activeMonth, offline }, { budgets }] = await Promise.all([
    resolveActiveMonth(monthParam ?? cookieMonth),
    getMasterData(),
  ]);

  if (offline) {
    return data({
      entries: [] as ExpenseEntry[],
      prevEntries: [] as ExpenseEntry[],
      prevMonth: null as string | null,
      activeMonth,
      months,
      budgets,
      offline: true,
    });
  }

  const prev = previousMonth(activeMonth);
  const hasPrev = months.includes(prev);

  try {
    const [entries, prevEntries] = await Promise.all([
      getExpensesByMonth(activeMonth),
      hasPrev ? getExpensesByMonth(prev) : Promise.resolve([]),
    ]);
    return data({
      entries,
      prevEntries,
      prevMonth: hasPrev ? prev : null,
      activeMonth,
      months,
      budgets,
    });
  } catch {
    return data({
      entries: [] as ExpenseEntry[],
      prevEntries: [] as ExpenseEntry[],
      prevMonth: null as string | null,
      activeMonth,
      months,
      budgets,
      error: 'Failed to load expenses',
    });
  }
}

function formatAmount(amount: number): string {
  return `IDR ${new Intl.NumberFormat('id-ID').format(Math.round(amount))}`;
}

function formatCompact(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(y, m - 1, 1),
  );
}

function sumBy(entries: ExpenseEntry[], key: keyof ExpenseEntry) {
  const totals = new Map<string, number>();
  for (const e of entries) {
    const k = String(e[key]) || 'Unknown';
    totals.set(k, (totals.get(k) ?? 0) + e.amount);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

const LEVEL_BAR: Record<BudgetLevel, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
};

const LEVEL_TEXT: Record<BudgetLevel, string> = {
  ok: 'text-slate-500',
  warn: 'text-amber-700',
  over: 'text-red-600',
};

function BudgetBar({ ratio, level }: { ratio: number; level: BudgetLevel }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div
        className={`h-2 rounded-full ${LEVEL_BAR[level]}`}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
    </div>
  );
}

function BudgetList({ rows }: { rows: BudgetRow[] }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Budget</h2>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-700">
                {r.category}
              </span>
              <span className="shrink-0 text-slate-500">
                <span className="font-semibold text-slate-900">
                  {formatCompact(r.spent)}
                </span>{' '}
                / {formatCompact(r.budget)}
              </span>
            </div>
            <BudgetBar ratio={r.ratio} level={r.level} />
            <p className={`text-[11px] ${LEVEL_TEXT[r.level]}`}>
              {r.spent > r.budget
                ? `${formatAmount(r.spent - r.budget)} over`
                : `${formatAmount(r.budget - r.spent)} left · ${Math.round(r.ratio * 100)}%`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BreakdownList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  const max = rows[0]?.[1] ?? 0;
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      <ul className="flex flex-col gap-3">
        {rows.map(([label, amount]) => (
          <li key={label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-700">
                {label}
              </span>
              <span className="shrink-0 text-slate-500">
                <span className="font-semibold text-slate-900">
                  {formatAmount(amount)}
                </span>{' '}
                · {total > 0 ? Math.round((amount / total) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DailyChart({
  month,
  daily,
}: {
  month: string;
  daily: number[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...daily, 0);
  const [y, m] = month.split('-').map(Number);
  const shown =
    selected ?? daily.reduce((best, v, i) => (v > daily[best] ? i : best), 0);
  const shownLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(y, m - 1, shown + 1));

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Daily spending</h2>
        <span className="text-xs text-slate-500">
          {selected === null && max > 0 ? 'Highest · ' : ''}
          {shownLabel} ·{' '}
          <span className="font-semibold text-slate-900">
            {formatAmount(daily[shown] ?? 0)}
          </span>
        </span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-white pl-1 text-[10px] text-slate-400">
          {formatCompact(max)}
        </span>
        <div
          className="flex h-32 items-end"
          onMouseLeave={() => setSelected(null)}
        >
          {daily.map((value, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Day ${i + 1}: ${formatAmount(value)}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
              className="flex h-full flex-1 items-end px-px"
            >
              <span
                className={`block w-full rounded-t-[3px] ${
                  i === shown ? 'bg-blue-700' : 'bg-blue-500'
                }`}
                style={{
                  height: max > 0 && value > 0 ? `${Math.max((value / max) * 100, 2)}%` : 0,
                }}
              />
            </button>
          ))}
        </div>
        <div className="border-t border-slate-300" />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>1</span>
          <span>{Math.ceil(daily.length / 2)}</span>
          <span>{daily.length}</span>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const error = 'error' in loaderData ? (loaderData.error as string) : null;
  const isOffline =
    'offline' in loaderData ? (loaderData.offline as boolean) : false;
  const { activeMonth, months, prevMonth } = loaderData;
  const entries = loaderData.entries as ExpenseEntry[];
  const prevEntries = loaderData.prevEntries as ExpenseEntry[];
  const budgets = loaderData.budgets as Record<string, number>;
  const navigate = useNavigate();
  const [sourceFilter, setSourceFilter] = useState('All');

  const sources = [
    'All',
    ...sumBy([...entries, ...prevEntries], 'source').map(([s]) => s),
  ];
  const bySource = (list: ExpenseEntry[]) =>
    sourceFilter === 'All'
      ? list
      : list.filter((e) => (e.source || 'Unknown') === sourceFilter);
  const filtered = bySource(entries);
  const prevFiltered = bySource(prevEntries);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevFiltered.reduce((s, e) => s + e.amount, 0);

  const [y, m] = activeMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const jakartaNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }),
  );
  const isCurrentMonth =
    jakartaNow.getFullYear() === y && jakartaNow.getMonth() + 1 === m;
  const daysElapsed = isCurrentMonth ? jakartaNow.getDate() : daysInMonth;

  const daily = Array.from({ length: daysInMonth }, () => 0);
  for (const e of filtered) {
    const d = dayOfMonth(e.date);
    if (d !== null && d <= daysInMonth) daily[d - 1] += e.amount;
  }

  const projected = isCurrentMonth
    ? projectMonthTotal(total, daysElapsed, daysInMonth)
    : null;

  // Budgets cover the whole household, so they only apply to the unfiltered view
  const showBudget = sourceFilter === 'All' && Object.keys(budgets).length > 0;
  const budgetList = showBudget ? budgetRows(filtered, budgets) : [];
  const budgetTotal = budgetList.reduce((s, r) => s + r.budget, 0);
  const budgetSpent = budgetList.reduce((s, r) => s + r.spent, 0);
  const budgetProjected = isCurrentMonth
    ? projectMonthTotal(budgetSpent, daysElapsed, daysInMonth)
    : budgetSpent;
  const allBudgeted = budgetList.length > 0 &&
    filtered.every((e) => e.category in budgets);

  const change =
    prevMonth && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const top = [...filtered].sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50">
      <header className="flex items-center justify-between bg-white px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <div className="mt-2">
          <MonthSelector
            months={months}
            activeMonth={activeMonth}
            onChange={(month) => navigate(`/dashboard?month=${month}`)}
          />
        </div>
      </header>

      {sources.length > 2 && (
        <div className="flex gap-1 overflow-x-auto bg-white px-4 pb-3">
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isOffline && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          You're offline — dashboard unavailable until reconnected.
        </div>
      )}

      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}

      {!isOffline && !error && filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="text-5xl">📊</span>
          <p className="text-lg font-semibold text-slate-700">
            No expenses yet
          </p>
          <p className="text-sm text-slate-400">
            Start logging your expenses from the Add tab.
          </p>
        </div>
      ) : (
        !isOffline &&
        !error && (
          <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
            <section className="rounded-xl bg-slate-900 p-4 text-white shadow-sm">
              <p className="text-xs text-slate-300">
                Total spending · {monthName(activeMonth)}
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight">
                {formatAmount(total)}
              </p>
              {change !== null && prevMonth && (
                <p className="mt-1 text-xs text-slate-300">
                  {change >= 0 ? '▲' : '▼'} {Math.abs(Math.round(change))}%{' '}
                  {change >= 0 ? 'more' : 'less'} than {monthName(prevMonth)} (
                  {formatAmount(prevTotal)})
                </p>
              )}
              {projected !== null && projected > total && (
                <p className="mt-1 text-xs text-slate-300">
                  On pace for{' '}
                  <span className="font-semibold text-white">
                    {formatAmount(projected)}
                  </span>{' '}
                  by month end
                </p>
              )}
              {budgetTotal > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>
                      {allBudgeted ? 'Budget' : 'Budgeted categories'}
                    </span>
                    <span>
                      {formatCompact(budgetSpent)} / {formatCompact(budgetTotal)}{' '}
                      · {Math.round((budgetSpent / budgetTotal) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${LEVEL_BAR[budgetLevel(budgetSpent, budgetTotal)]}`}
                      style={{
                        width: `${Math.min(budgetSpent / budgetTotal, 1) * 100}%`,
                      }}
                    />
                  </div>
                  {isCurrentMonth &&
                    budgetSpent <= budgetTotal &&
                    budgetProjected > budgetTotal && (
                      <p className="text-[11px] text-amber-300">
                        At this pace you'll go over by{' '}
                        {formatAmount(budgetProjected - budgetTotal)}
                      </p>
                    )}
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-700 pt-3">
                <div>
                  <p className="text-[10px] text-slate-400">Transactions</p>
                  <p className="text-sm font-semibold">{filtered.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Avg / day</p>
                  <p className="text-sm font-semibold">
                    {formatCompact(total / Math.max(daysElapsed, 1))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Avg / txn</p>
                  <p className="text-sm font-semibold">
                    {formatCompact(total / Math.max(filtered.length, 1))}
                  </p>
                </div>
              </div>
            </section>

            {budgetList.length > 0 && <BudgetList rows={budgetList} />}

            <DailyChart month={activeMonth} daily={daily} />

            <BreakdownList
              title="By category"
              rows={sumBy(filtered, 'category')}
              total={total}
            />
            {sourceFilter === 'All' && (
              <BreakdownList
                title="By person"
                rows={sumBy(filtered, 'source')}
                total={total}
              />
            )}
            <BreakdownList
              title="By payment method"
              rows={sumBy(filtered, 'method')}
              total={total}
            />

            <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Biggest expenses
              </h2>
              <ol className="flex flex-col divide-y divide-slate-100">
                {top.map((e, i) => (
                  <li
                    key={`${e.timestamp}-${i}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {e.item}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {e.category}
                        {dayOfMonth(e.date) !== null &&
                          ` · ${monthName(activeMonth).slice(0, 3)} ${dayOfMonth(e.date)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatAmount(e.amount)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )
      )}
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong'
    : 'Something went wrong';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      <a
        href="/"
        className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
      >
        Go home
      </a>
    </main>
  );
}
