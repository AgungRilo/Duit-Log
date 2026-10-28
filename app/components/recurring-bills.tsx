import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import type { PendingBill } from '~/lib/recurring';
import { repeatSearch } from '~/lib/filters';
import { cn } from '~/lib/utils';

interface BillsResponse {
  month: string;
  bills: PendingBill[];
  logged: string[];
}

const formatIdr = (n: number) => new Intl.NumberFormat('id-ID').format(n);

function formatDue(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/**
 * Collapsible list of Recurring-tab bills not yet logged this month, each
 * loggable with one tap. Loads after the page so the Add form stays instant;
 * hides itself when there's nothing due or the request fails (e.g. offline).
 */
export function RecurringBills({
  month,
  refreshKey,
}: {
  month: string;
  /** Change to reload, e.g. after another expense was saved */
  refreshKey: number;
}) {
  const [result, setResult] = useState<BillsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recurring?month=${month}`)
      .then((res) => (res.ok ? (res.json() as Promise<BillsResponse>) : null))
      .then((body) => {
        if (!cancelled) setResult(body);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [month, refreshKey]);

  async function logBills(ids: number[]) {
    setBusy(ids);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        body: new URLSearchParams({ month, ids: ids.join(',') }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as BillsResponse;
      setResult(body);
      if (body.logged.length > 0) {
        toast.success(
          body.logged.length === 1
            ? `Logged ${body.logged[0]}`
            : `Logged ${body.logged.length} bills`,
        );
      }
    } catch {
      toast.error(
        navigator.onLine
          ? 'Failed to log bills. Please try again.'
          : "You're offline — bills can be logged once you reconnect.",
      );
    } finally {
      setBusy(null);
    }
  }

  const bills = result?.month === month ? result.bills : [];
  if (bills.length === 0) return null;

  const loggable = bills.filter((b) => !b.problem);
  const overdue = bills.filter((b) => b.overdue).length;
  const total = loggable.reduce((s, b) => s + b.amount, 0);

  return (
    <section className="mx-4 mb-2 rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Receipt className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="font-medium text-slate-800">Bills this month</span>
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
          {bills.length} left
        </span>
        {overdue > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            {overdue} overdue
          </span>
        )}
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3">
          <ul className="divide-y divide-slate-100">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <Link
                  to={`/?${repeatSearch(b)}`}
                  aria-label={`Edit ${b.item} before logging`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-medium text-slate-800">
                    {b.item}
                  </p>
                  <p
                    className={cn(
                      'text-[11px]',
                      b.problem
                        ? 'text-red-600'
                        : b.overdue
                          ? 'text-red-600'
                          : 'text-slate-400',
                    )}
                  >
                    {b.problem ??
                      `${b.overdue ? 'Overdue · ' : 'Due '}${formatDue(b.dueDate)} · ${b.category} · ${b.method}`}
                  </p>
                </Link>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatIdr(b.amount)}
                </span>
                {!b.problem && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => logBills([b.id])}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy?.includes(b.id) && busy.length === 1 ? '...' : 'Log'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {loggable.length > 1 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => logBills(loggable.map((b) => b.id))}
              className="mt-2 w-full rounded-lg border-2 border-slate-900 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
            >
              {busy && busy.length > 1
                ? 'Logging...'
                : `Log all ${loggable.length} · IDR ${formatIdr(total)}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
