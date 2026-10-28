import { Link } from 'react-router';
import { Repeat } from 'lucide-react';
import type { ExpenseEntry } from '~/lib/types';

const categoryColors: Record<string, string> = {
  Food: 'bg-amber-100 text-amber-800',
  Transport: 'bg-blue-100 text-blue-800',
  Groceries: 'bg-green-100 text-green-800',
  Utilities: 'bg-purple-100 text-purple-800',
  Health: 'bg-red-100 text-red-800',
  Entertainment: 'bg-pink-100 text-pink-800',
  Shopping: 'bg-indigo-100 text-indigo-800',
  Education: 'bg-teal-100 text-teal-800',
  Other: 'bg-slate-100 text-slate-800',
};

function sourceColor(source: string): string {
  if (source === 'Agung') return 'bg-blue-500 text-white';
  if (source === 'Family') return 'bg-rose-500 text-white';
  if (source === 'Together') return 'bg-indigo-500 text-white';
  return 'bg-slate-200 text-slate-700';
}

function formatAmount(amount: number): string {
  return `IDR ${new Intl.NumberFormat('id-ID').format(amount)}`;
}

function formatDate(dateStr: string): string {
  // dateStr is "M/D/YYYY"
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [month, day, year] = parts;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

function relativeTime(timestamp: string): string {
  // timestamp is "M/D/YYYY HH:mm:ss"
  const [datePart, timePart] = timestamp.split(' ');
  if (!datePart || !timePart) return '';
  const [month, day, year] = datePart.split('/');
  const [hours, minutes, seconds] = timePart.split(':');
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  if (isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w ago`;
}

export function ExpenseCard({
  entry,
  editTo,
  repeatTo,
}: {
  entry: ExpenseEntry;
  /** Makes the card body a link to edit the entry */
  editTo?: string;
  /** Shows a repeat button linking to a prefilled Add form */
  repeatTo?: string;
}) {
  const colorClass = categoryColors[entry.category] ?? categoryColors.Other;
  const bodyClass =
    'flex min-w-0 flex-1 items-center justify-between px-4 py-3';

  const body = (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-lg font-semibold text-slate-900">
          {formatAmount(entry.amount)}
        </span>
        <span className="truncate text-sm font-medium text-slate-700">
          {entry.item}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
          >
            {entry.category}
          </span>
          <span className="text-[11px] text-slate-400">{entry.method}</span>
          {entry.source && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceColor(entry.source)}`}
            >
              {entry.source}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 pl-3">
        <span className="text-xs font-medium text-slate-600">
          {formatDate(entry.date)}
        </span>
        <span className="text-[10px] text-slate-400">
          {relativeTime(entry.timestamp)}
        </span>
      </div>
    </>
  );

  return (
    <div className="flex items-stretch rounded-xl border border-slate-100 bg-white shadow-sm">
      {editTo ? (
        <Link to={editTo} aria-label={`Edit ${entry.item}`} className={bodyClass}>
          {body}
        </Link>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      {repeatTo && (
        <Link
          to={repeatTo}
          aria-label={`Log ${entry.item} again`}
          title="Log again"
          className="flex shrink-0 items-center border-l border-slate-100 px-3 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Repeat className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
