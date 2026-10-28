import { useState } from 'react';
import {
  data,
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/dashboard';
import { getExpensesByMonths } from '~/lib/sheets.server';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth } from '~/lib/month.server';
import { selectedMonthCookie } from '~/lib/cookies.server';
import type { ExpenseEntry } from '~/lib/types';
import { MonthSelector } from '~/components/month-selector';
import { dayOfMonth, previousMonth } from '~/lib/dates';
import { getMasterData } from '~/lib/master.server';
import { getIncomeByMonth } from '~/lib/income.server';
import { getTransfersByMonth } from '~/lib/transfers.server';
import type { TransferEntry } from '~/lib/transfers';
import { methodFlows, type MethodFlow } from '~/lib/cashflow';
import {
  budgetLevel,
  budgetRows,
  projectMonthTotal,
  type BudgetLevel,
  type BudgetRow,
} from '~/lib/budget';
import {
  average,
  categoryTrends,
  monthTotal,
  percentChange,
  summarizeMonth,
  trendMonths,
  trendSources,
  type CategoryTrend,
  type MonthSummary,
} from '~/lib/trend';

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
      trend: [] as MonthSummary[],
      income: [] as ExpenseEntry[],
      transfers: [] as TransferEntry[],
      prevMonth: null as string | null,
      activeMonth,
      months,
      budgets,
      offline: true,
    });
  }

  const prev = previousMonth(activeMonth);
  // Active month plus up to five before it, read in one API call
  const monthsToRead = trendMonths(months, activeMonth);

  try {
    const [byMonth, income, transfers] = await Promise.all([
      getExpensesByMonths(monthsToRead),
      // Income and transfers are optional; a failure shouldn't hide the expense dashboard
      getIncomeByMonth(activeMonth).catch(() => [] as ExpenseEntry[]),
      getTransfersByMonth(activeMonth).catch(() => [] as TransferEntry[]),
    ]);
    return data({
      entries: byMonth[activeMonth] ?? [],
      income,
      transfers,
      // Older months only need totals, which keeps the payload small
      trend: monthsToRead.map((m) => summarizeMonth(m, byMonth[m] ?? [])),
      prevMonth: monthsToRead.includes(prev) ? prev : null,
      activeMonth,
      months,
      budgets,
    });
  } catch {
    return data({
      entries: [] as ExpenseEntry[],
      trend: [] as MonthSummary[],
      income: [] as ExpenseEntry[],
      transfers: [] as TransferEntry[],
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

function shortMonth(month: string): string {
  return monthName(month).slice(0, 3);
}

function TrendChart({
  trend,
  source,
  projected,
}: {
  trend: MonthSummary[];
  source: string;
  /** Month-end estimate for the current month, drawn behind its bar */
  projected: number | null;
}) {
  const totals = trend.map((t) => monthTotal(t, source));
  const last = totals.length - 1;
  const [selected, setSelected] = useState<number | null>(null);
  const avg = average(totals.slice(0, -1)) ?? 0;
  const ghost = projected !== null && projected > totals[last] ? projected : 0;
  const max = Math.max(...totals, ghost, avg, 0);
  const shown = selected ?? last;
  const change = percentChange(totals[last], avg);
  const pct = (v: number) => (max > 0 ? `${(v / max) * 100}%` : '0');

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Last {trend.length} months
        </h2>
        <span className="text-xs text-slate-500">
          {monthName(trend[shown].month)} ·{' '}
          <span className="font-semibold text-slate-900">
            {formatAmount(totals[shown])}
          </span>
        </span>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        Avg of previous months {formatAmount(avg)}
        {change !== null && (
          <span className={change > 0 ? 'text-red-600' : 'text-emerald-600'}>
            {' '}
            · this month {change > 0 ? '▲' : '▼'}{' '}
            {Math.abs(Math.round(change))}%
          </span>
        )}
      </p>
      <div>
        <div
          className="relative flex h-32 items-end gap-2"
          onMouseLeave={() => setSelected(null)}
        >
          {avg > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-slate-500"
              style={{ bottom: pct(avg) }}
            />
          )}
          {totals.map((value, i) => (
            <button
              key={trend[i].month}
              type="button"
              aria-label={`${monthName(trend[i].month)}: ${formatAmount(value)}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
              className="relative flex h-full flex-1 items-end"
            >
              {i === last && ghost > 0 && (
                <span
                  className="absolute inset-x-0 bottom-0 rounded-t-[4px] border border-dashed border-blue-300 bg-blue-50"
                  style={{ height: pct(ghost) }}
                />
              )}
              <span
                className={`relative block w-full rounded-t-[4px] ${
                  i === shown ? 'bg-blue-700' : 'bg-blue-500'
                }`}
                style={{ height: value > 0 ? `max(2px, ${pct(value)})` : 0 }}
              />
            </button>
          ))}
        </div>
        <div className="border-t border-slate-300" />
        <div className="mt-1 flex gap-2 text-[10px] text-slate-400">
          {trend.map((t) => (
            <span key={t.month} className="flex-1 text-center">
              {shortMonth(t.month)}
            </span>
          ))}
        </div>
      </div>
      {ghost > 0 && (
        <p className="mt-2 text-[10px] text-slate-400">
          Dashed bar: projected month end ({formatCompact(ghost)})
        </p>
      )}
    </section>
  );
}

function CategoryTrendList({
  trends,
  months,
  inProgress,
}: {
  trends: CategoryTrend[];
  months: string[];
  /** The last month isn't over yet, so its numbers are still growing */
  inProgress: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Category trends</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        This month vs average of previous months
        {inProgress && ' · month in progress'}
      </p>
      <ul className="flex flex-col gap-3">
        {trends.map((t) => {
          const max = Math.max(...t.values, 0);
          const rounded = t.change === null ? null : Math.round(t.change);
          return (
            <li key={t.category} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">
                  {t.category}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatCompact(t.current)}
                  {t.avgBefore !== null &&
                    ` · avg ${formatCompact(t.avgBefore)}`}
                </p>
              </div>
              <div
                className="flex h-6 w-20 shrink-0 items-end gap-0.5"
                aria-hidden="true"
                title={months
                  .map((m, i) => `${shortMonth(m)}: ${formatCompact(t.values[i])}`)
                  .join(' · ')}
              >
                {t.values.map((v, i) => (
                  <span
                    key={i}
                    className={`block flex-1 rounded-t-[2px] ${
                      i === t.values.length - 1 ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                    style={{
                      height: max > 0 && v > 0 ? `${Math.max((v / max) * 100, 8)}%` : 0,
                    }}
                  />
                ))}
              </div>
              <span
                className={`w-12 shrink-0 text-right text-[11px] font-semibold ${
                  rounded === null || rounded === 0
                    ? 'text-slate-400'
                    : rounded > 0
                      ? 'text-red-600'
                      : 'text-emerald-600'
                }`}
              >
                {rounded === 0
                  ? '0%'
                  : rounded !== null
                    ? `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded)}%`
                    : t.avgBefore === 0 && t.current > 0
                      ? 'New'
                      : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CashFlow({
  income,
  spent,
  flows,
  transfers,
}: {
  income: number;
  spent: number;
  flows: MethodFlow[];
  transfers: TransferEntry[];
}) {
  const net = income - spent;
  const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatCompact(Math.abs(n))}`;
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Cash flow</h2>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-slate-500">Income</p>
          <p className="text-sm font-semibold text-emerald-600">
            {formatCompact(income)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Spent</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatCompact(spent)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Left</p>
          <p
            className={`text-sm font-semibold ${net < 0 ? 'text-red-600' : 'text-emerald-600'}`}
          >
            {signed(net)}
          </p>
        </div>
      </div>
      {flows.length > 0 && (
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-400">
              <th className="pb-1 text-left font-medium">Method</th>
              <th className="pb-1 text-right font-medium">In</th>
              <th className="pb-1 text-right font-medium">Out</th>
              <th className="pb-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flows.map((f) => (
              <tr key={f.method}>
                <td className="truncate py-1.5 font-medium text-slate-700">
                  {f.method}
                </td>
                <td className="py-1.5 text-right text-slate-500">
                  {f.in ? formatCompact(f.in) : '—'}
                </td>
                <td className="py-1.5 text-right text-slate-500">
                  {f.out ? formatCompact(f.out) : '—'}
                </td>
                <td
                  className={`py-1.5 text-right font-semibold ${f.net < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                >
                  {signed(f.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {transfers.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] font-medium text-slate-500">
            Transfers between pockets
          </p>
          <ul className="flex flex-col gap-1">
            {transfers.map((t) => (
              <li
                key={t.row}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate text-slate-600">
                  {t.from} → {t.to}
                  {t.note && <span className="text-slate-400"> · {t.note}</span>}
                </span>
                <span className="shrink-0 font-medium text-slate-900">
                  {formatCompact(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        Money in and out this month, not account balances. Transfers move
        money between pockets and don't count as income or spending.
      </p>
    </section>
  );
}

function BreakdownList({
  title,
  rows,
  total,
  barClass = 'bg-blue-500',
}: {
  title: string;
  rows: [string, number][];
  total: number;
  barClass?: string;
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
                className={`h-2 rounded-full ${barClass}`}
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
  const trend = loaderData.trend as MonthSummary[];
  const income = loaderData.income as ExpenseEntry[];
  const transfers = loaderData.transfers as TransferEntry[];
  const budgets = loaderData.budgets as Record<string, number>;
  const navigate = useNavigate();
  const [sourceFilter, setSourceFilter] = useState('All');

  const sources = [
    'All',
    ...new Set([
      ...trendSources(trend),
      ...sumBy(income, 'source').map(([s]) => s),
    ]),
  ];
  const bySource = (list: ExpenseEntry[]) =>
    sourceFilter === 'All'
      ? list
      : list.filter((e) => (e.source || 'Unknown') === sourceFilter);
  const filtered = bySource(entries);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const incomeFiltered = bySource(income);
  const incomeTotal = incomeFiltered.reduce((s, e) => s + e.amount, 0);
  // Transfers have no source, so they only belong in the household view
  const transfersShown = sourceFilter === 'All' ? transfers : [];
  const prevSummary = trend.find((t) => t.month === prevMonth);
  const prevTotal = prevSummary ? monthTotal(prevSummary, sourceFilter) : 0;

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

      {!isOffline &&
      !error &&
      filtered.length === 0 &&
      incomeFiltered.length === 0 &&
      transfersShown.length === 0 ? (
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

            {(incomeFiltered.length > 0 || transfersShown.length > 0) && (
              <CashFlow
                income={incomeTotal}
                spent={total}
                flows={methodFlows(filtered, incomeFiltered, transfersShown)}
                transfers={transfersShown}
              />
            )}

            {budgetList.length > 0 && <BudgetList rows={budgetList} />}

            <DailyChart month={activeMonth} daily={daily} />

            {trend.length >= 2 && (
              <>
                <TrendChart
                  trend={trend}
                  source={sourceFilter}
                  projected={projected}
                />
                <CategoryTrendList
                  trends={categoryTrends(trend, sourceFilter)}
                  months={trend.map((t) => t.month)}
                  inProgress={isCurrentMonth}
                />
              </>
            )}

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
            {incomeFiltered.length > 0 && (
              <BreakdownList
                title="Income by category"
                rows={sumBy(incomeFiltered, 'category')}
                total={incomeTotal}
                barClass="bg-emerald-500"
              />
            )}

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
