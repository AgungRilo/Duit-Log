import { useEffect, useRef, useState, useCallback } from 'react';
import {
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/_index';
import {
  appendExpense,
  ensureMonthSheet,
} from '~/lib/sheets.server';
import { expenseSchema, incomeSchema, transferSchema } from '~/lib/validation';
import { appendTransfer } from '~/lib/transfers.server';
import { appendIncome } from '~/lib/income.server';
import { getMasterData } from '~/lib/master.server';
import { jakartaTimestamp } from '~/lib/dates';
import { parseRepeat } from '~/lib/filters';
import { budgetAlert } from '~/lib/budget';
import { ExpenseForm } from '~/components/expense-form';
import { MonthSelector } from '~/components/month-selector';
import { RecurringBills } from '~/components/recurring-bills';
import { log } from '~/lib/logger.server';
import { toast } from 'sonner';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth, isNetworkError } from '~/lib/month.server';
import {
  selectedMonthCookie,
  selectedSourceCookie,
} from '~/lib/cookies.server';
import {
  addPendingExpense,
  getPendingCount,
  registerBackgroundSync,
} from '~/lib/offline-queue';
import { syncPendingExpenses } from '~/lib/sync';

const formatIdr = (n: number) => new Intl.NumberFormat('id-ID').format(n);

// Runs after a successful save so it never slows the save itself down
async function checkBudget(entry: {
  month: string;
  category: string;
  amount: number;
}) {
  try {
    const params = new URLSearchParams({
      month: entry.month,
      category: entry.category,
    });
    const res = await fetch(`/api/budget?${params}`);
    if (!res.ok) return;
    const { spent, budget } = (await res.json()) as {
      spent: number;
      budget: number;
    };
    if (!budget) return;
    const alert = budgetAlert(spent, entry.amount, budget);
    const usage = `IDR ${formatIdr(spent)} of IDR ${formatIdr(budget)}`;
    if (alert === 'over') {
      toast.error(`${entry.category} is over budget`, {
        description: `${usage} (+IDR ${formatIdr(spent - budget)})`,
      });
    } else if (alert === 'warn') {
      toast.warning(
        `${entry.category} has used ${Math.round((spent / budget) * 100)}% of its budget`,
        { description: usage },
      );
    }
  } catch {
    // Budget check is best-effort
  }
}

function formatMonthLabel(month: string): string {
  const date = new Date(month + '-01');
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

type Kind = 'expense' | 'income' | 'transfer';

// Everything the form posts; a transfer also has `to` and leaves category/source blank
type SavedEntry = {
  month: string;
  item: string;
  date: string;
  amount: number;
  category: string;
  method: string;
  source: string;
  to: string;
  kind: Kind;
};

type ActionData =
  | { success: true; entry: SavedEntry }
  | { success: false; errors: Record<string, string> }
  | { success: false; error: string }
  | { success: false; networkError: true; pendingData: SavedEntry };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const cookieHeader = request.headers.get('Cookie');
  const cookieMonth = await selectedMonthCookie.parse(cookieHeader);
  const cookieSource = await selectedSourceCookie.parse(cookieHeader);

  const [{ months, activeMonth }, master] = await Promise.all([
    resolveActiveMonth(cookieMonth),
    getMasterData(),
  ]);

  return data({
    months,
    activeMonth,
    master,
    // Set when arriving from a history card's repeat button
    prefill: parseRepeat(new URL(request.url).searchParams, master),
    defaultSource: master.sources.includes(cookieSource)
      ? (cookieSource as string)
      : master.sources[0],
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const kind: Kind =
    formData.get('kind') === 'income'
      ? 'income'
      : formData.get('kind') === 'transfer'
        ? 'transfer'
        : 'expense';
  const raw = {
    month: formData.get('month') as string,
    item: formData.get('item') as string,
    date: formData.get('date') as string,
    amount: formData.get('amount') as string,
    category: formData.get('category') as string,
    method: formData.get('method') as string,
    source: formData.get('source') as string,
    to: formData.get('to') as string,
  };

  const master = await getMasterData();
  let entry: SavedEntry;
  if (kind === 'transfer') {
    const result = transferSchema(master).safeParse(raw);
    if (!result.success) {
      return data({ success: false as const, errors: fieldErrors(result.error.issues) });
    }
    const t = result.data;
    entry = { ...t, category: '', source: '', kind };
  } else {
    const schema = kind === 'income' ? incomeSchema(master) : expenseSchema(master);
    const result = schema.safeParse(raw);
    if (!result.success) {
      return data({ success: false as const, errors: fieldErrors(result.error.issues) });
    }
    entry = { ...result.data, to: '', kind };
  }

  // Create the target month tab if missing (skip when offline — appendExpense will fail gracefully)
  // Income and transfers live in their own tabs, created on first save
  if (kind === 'expense') {
    try {
      await ensureMonthSheet(entry.month);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // Offline — skip verification and let appendExpense attempt (and fail) below
    }
  }

  const timestamp = jakartaTimestamp();

  try {
    // Dates are ISO so Sheets parses them correctly regardless of spreadsheet locale
    if (kind === 'transfer') {
      await appendTransfer([
        timestamp,
        entry.date,
        entry.method, // From
        entry.to,
        String(entry.amount),
        entry.item, // Note
      ]);
    } else {
      const row = [
        timestamp, // Timestamp
        entry.item, // Item
        entry.category, // Category
        String(entry.amount), // Amount (IDR)
        entry.method, // Payment Method
        entry.date, // Date
        entry.source, // Source
      ];
      if (kind === 'income') await appendIncome(row);
      else await appendExpense(entry.month, row);
    }

    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      await selectedMonthCookie.serialize(entry.month),
    );
    if (entry.source) {
      headers.append(
        'Set-Cookie',
        await selectedSourceCookie.serialize(entry.source),
      );
    }
    return data({ success: true as const, entry }, { headers });
  } catch (err) {
    if (isNetworkError(err)) {
      return data({
        success: false as const,
        networkError: true as const,
        pendingData: entry,
      });
    }
    log('error', 'action_append_error', {
      kind,
      error: (err as Error).message,
    });
    return data(
      {
        success: false as const,
        error: 'Failed to save. Please try again.',
      },
      { status: 500 },
    );
  }
}

export default function Index() {
  const { months, activeMonth, master, defaultSource, prefill: repeat } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | ActionData
    | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const amountRef = useRef<HTMLInputElement>(null);

  const [selectedMonth, setSelectedMonth] = useState(activeMonth);
  const [prefill, setPrefill] = useState(repeat ?? undefined);
  const location = useLocation();
  const navigate = useNavigate();

  // A repeat link followed while already on this page (e.g. from the bills card)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (repeat) {
      setKind('expense');
      setPrefill(repeat);
      setFormKey((k) => k + 1);
    }
  }, [location.search]);

  // After saving or dismissing a repeat, go back to a blank form at "/"
  function clearPrefill() {
    setPrefill(undefined);
    if (location.search) navigate('/', { replace: true });
  }
  const [formKey, setFormKey] = useState(0);
  const [kind, setKind] = useState<Kind>('expense');

  function switchKind(next: Kind) {
    if (next === kind) return;
    setKind(next);
    clearPrefill();
    setFormKey((k) => k + 1);
  }
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Track online/offline status
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load pending count on mount
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when coming back online
  // Skip when SyncManager is available — the SW Background Sync owns it then,
  // preventing concurrent submissions of the same queued entry.
  useEffect(() => {
    if (!isOnline || pendingCount === 0 || isSyncing) return;
    if (typeof window !== 'undefined' && 'SyncManager' in window)
      return;

    setIsSyncing(true);
    syncPendingExpenses((synced, total) => {
      setPendingCount(total - synced);
    })
      .then(({ synced, failed }) => {
        refreshPendingCount();
        if (synced > 0) {
          toast.success(
            `Synced ${synced} expense${synced > 1 ? 's' : ''} to Google Sheets${failed > 0 ? ` (${failed} failed)` : ''}`,
          );
        }
      })
      .catch((error) => {
        // Ensure the user is informed when background sync fails
        console.error('Failed to sync pending expenses', error);
        toast.error(
          'Failed to sync pending expenses. They will be retried automatically when possible.',
        );
      })
      .finally(() => {
        setIsSyncing(false);
      });
  }, [isOnline, pendingCount, isSyncing, refreshPendingCount]);

  // Listen for SW sync-complete message
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        refreshPendingCount();
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () =>
      navigator.serviceWorker.removeEventListener('message', handler);
  }, [refreshPendingCount]);

  // Handle action response
  useEffect(() => {
    if (!actionData) return;

    if (actionData.success) {
      const { entry } = actionData;
      toast.success(
        entry.kind === 'transfer'
          ? `Moved IDR ${entry.amount.toLocaleString()}: ${entry.method} → ${entry.to}`
          : entry.kind === 'income'
            ? `Income saved: ${entry.item} — IDR ${entry.amount.toLocaleString()}`
            : `Saved to ${formatMonthLabel(entry.month)}: ${entry.item} — IDR ${entry.amount.toLocaleString()}`,
      );
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(50);
      }
      if (entry.kind === 'expense' && master.budgets[entry.category]) {
        checkBudget(actionData.entry);
      }
      clearPrefill();
      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 100);
    } else if ('networkError' in actionData && actionData.networkError) {
      // Server couldn't reach Sheets — fall back to offline queue
      const fd = new FormData();
      Object.entries(actionData.pendingData).forEach(([k, v]) =>
        fd.set(k, String(v)),
      );
      handleOfflineSubmit(fd);
    } else if ('error' in actionData && actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  function generateOfflineId(): string {
    // Prefer native crypto.randomUUID when available, fall back to timestamp+random
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    return (
      'offline-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
    );
  }

  // Handle offline form submission
  async function handleOfflineSubmit(formData: FormData) {
    const expense = {
      id: generateOfflineId(),
      createdAt: new Date().toISOString(),
      formData: {
        month: formData.get('month') as string,
        item: formData.get('item') as string,
        date: formData.get('date') as string,
        amount: formData.get('amount') as string,
        category: formData.get('category') as string,
        method: formData.get('method') as string,
        source: formData.get('source') as string,
        kind: (formData.get('kind') as string) || 'expense',
        to: (formData.get('to') as string) || undefined,
      },
    };
    try {
      await addPendingExpense(expense);
      await registerBackgroundSync();
      await refreshPendingCount();

      toast('Saved offline — will sync when connected', {
        style: {
          backgroundColor: '#fffbeb',
          color: '#92400e',
          border: '1px solid #fde68a',
        },
      });

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(50);
      }

      clearPrefill();
      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 100);
    } catch (error) {
      console.error('Failed to save expense offline', error);
      toast.error(
        'Could not save expense for offline use. Please try again or submit when back online.',
      );
    }
  }

  const errors =
    actionData && !actionData.success && 'errors' in actionData
      ? actionData.errors
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="px-4 flex justify-between items-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Duit-Log
        </h1>
        <div className="mt-2">
          <MonthSelector
            months={months}
            activeMonth={selectedMonth}
            onChange={setSelectedMonth}
          />
        </div>
      </header>

      {/* Offline banner */}
      {!isOnline && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          You're offline — expenses will be saved locally and synced
          when you reconnect.
        </div>
      )}

      {/* Pending sync badge */}
      {pendingCount > 0 && (
        <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm text-blue-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
            {pendingCount}
          </span>
          {isSyncing
            ? 'Syncing...'
            : `pending expense${pendingCount > 1 ? 's' : ''}`}
        </div>
      )}

      <div className="mx-4 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {(['expense', 'income', 'transfer'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            aria-pressed={kind === k}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
              kind === k
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            {k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}
          </button>
        ))}
      </div>

      {kind === 'expense' && (
        <RecurringBills month={selectedMonth} refreshKey={formKey} />
      )}

      {prefill && (
        <div className="mx-4 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="truncate">
            Repeating <span className="font-semibold text-slate-900">{prefill.item}</span>{' '}
            — check and save
          </span>
          <button
            type="button"
            onClick={() => {
              clearPrefill();
              setFormKey((k) => k + 1);
            }}
            className="shrink-0 font-medium text-slate-700 underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <ExpenseForm
        key={formKey}
        kind={kind}
        prefill={prefill}
        errors={errors}
        isSubmitting={isSubmitting}
        amountRef={amountRef}
        selectedMonth={selectedMonth}
        options={master}
        defaultSource={defaultSource}
        isOnline={isOnline}
        onOfflineSubmit={handleOfflineSubmit}
      />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isDev = process.env.NODE_ENV === 'development';
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong'
    : isDev && error instanceof Error
      ? error.message
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
