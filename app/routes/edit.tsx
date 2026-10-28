import { useEffect } from 'react';
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import { toast } from 'sonner';
import type { Route } from './+types/edit';
import {
  deleteExpense,
  getExpenseRow,
  updateExpense,
} from '~/lib/sheets.server';
import { requireAuth } from '~/lib/auth.server';
import { isNetworkError } from '~/lib/month.server';
import { expenseEditSchema } from '~/lib/validation';
import { getMasterData } from '~/lib/master.server';
import { toIsoDate } from '~/lib/dates';
import { log } from '~/lib/logger.server';
import { ExpenseForm } from '~/components/expense-form';

function parseParams(month: unknown, row: unknown) {
  const m = String(month ?? '');
  const r = Number(row);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || !Number.isInteger(r) || r < 2) {
    throw data('Expense not found', { status: 404, statusText: 'Expense not found' });
  }
  return { month: m, row: r };
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, 1));
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const url = new URL(request.url);
  const { month, row } = parseParams(
    url.searchParams.get('month'),
    url.searchParams.get('row'),
  );

  const [entry, master] = await Promise.all([
    getExpenseRow(month, row),
    getMasterData(),
  ]);
  if (!entry || (!entry.item && !entry.amount)) {
    throw data('Expense not found', { status: 404, statusText: 'Expense not found' });
  }

  return data({
    month,
    row,
    timestamp: entry.timestamp,
    master,
    initial: {
      amount: entry.amount,
      item: entry.item,
      category: entry.category,
      method: entry.method,
      date: toIsoDate(entry.date, month),
      source: entry.source,
    },
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const { month, row } = parseParams(formData.get('month'), formData.get('row'));

  try {
    const current = await getExpenseRow(month, row);
    // Guard against the row having been changed or moved in the sheet meanwhile
    if (!current || current.timestamp !== formData.get('timestamp')) {
      return data({
        success: false as const,
        error:
          'This expense was changed in the spreadsheet. Go back and try again.',
      });
    }

    if (formData.get('intent') === 'delete') {
      await deleteExpense(month, row);
      return data({
        success: true as const,
        deleted: true,
        month,
        item: current.item,
      });
    }

    const result = expenseEditSchema(await getMasterData(), current).safeParse({
      month,
      item: formData.get('item'),
      date: formData.get('date'),
      amount: formData.get('amount'),
      category: formData.get('category'),
      method: formData.get('method'),
      source: formData.get('source'),
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return data({ success: false as const, errors: fieldErrors });
    }

    const parsed = result.data;
    if (!parsed.date.startsWith(month)) {
      return data({
        success: false as const,
        errors: { date: `Date must be in ${formatMonthLabel(month)}` },
      });
    }

    await updateExpense(month, row, [
      parsed.item,
      parsed.category,
      String(parsed.amount),
      parsed.method,
      parsed.date, // ISO format so Sheets parses it regardless of locale
      parsed.source,
    ]);

    return data({
      success: true as const,
      deleted: false,
      month,
      item: parsed.item,
    });
  } catch (err) {
    if (isNetworkError(err)) {
      return data({
        success: false as const,
        error: "You're offline — connect to the internet to change expenses.",
      });
    }
    log('error', 'action_update_error', { error: (err as Error).message });
    return data(
      { success: false as const, error: 'Failed to save. Please try again.' },
      { status: 500 },
    );
  }
}

export default function Edit() {
  const { month, row, timestamp, master, initial } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!actionData) return;
    if (actionData.success) {
      toast.success(
        `${actionData.deleted ? 'Deleted' : 'Updated'}: ${actionData.item}`,
      );
      navigate(`/history?month=${actionData.month}`);
    } else if ('error' in actionData && actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData, navigate]);

  const isDeleting =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'delete';

  const errors =
    actionData && !actionData.success && 'errors' in actionData
      ? actionData.errors
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          to={`/history?month=${month}`}
          aria-label="Back to history"
          className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Edit Expense
          </h1>
          <p className="text-xs text-slate-500">{formatMonthLabel(month)}</p>
        </div>
      </header>

      <ExpenseForm
        errors={errors}
        isSubmitting={navigation.state === 'submitting' && !isDeleting}
        selectedMonth={month}
        options={master}
        initial={initial}
        hiddenFields={{ row: String(row), timestamp }}
        submitLabel="Save Changes"
      />

      <Form
        method="post"
        className="px-4 pb-6"
        onSubmit={(e) => {
          if (!window.confirm(`Delete "${initial.item}"? This can't be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="row" value={row} />
        <input type="hidden" name="timestamp" value={timestamp} />
        <button
          type="submit"
          disabled={navigation.state === 'submitting'}
          className="w-full rounded-xl border-2 border-red-200 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete Expense'}
        </button>
      </Form>
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
      <h1 className="text-xl font-bold text-slate-900">{message}</h1>
      <a
        href="/history"
        className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
      >
        Back to history
      </a>
    </main>
  );
}
