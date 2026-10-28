import type { ExpenseEntry } from './types';
import type { MasterData } from './master';

export interface EntryFilters {
  query: string;
  source: string;
  category: string;
  method: string;
}

export const ALL = 'All';

export const EMPTY_FILTERS: EntryFilters = {
  query: '',
  source: ALL,
  category: ALL,
  method: ALL
};

export function hasActiveFilters(f: EntryFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.source !== ALL ||
    f.category !== ALL ||
    f.method !== ALL
  );
}

/**
 * Narrows entries by source / category / method and a free-text query.
 * Every word of the query must appear in the item, category or method
 * (case-insensitive), so "kopi jago" finds "Kopi susu" paid with JAGO.
 */
export function filterEntries(
  entries: ExpenseEntry[],
  f: EntryFilters
): ExpenseEntry[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.source !== ALL && e.source !== f.source) return false;
    if (f.category !== ALL && e.category !== f.category) return false;
    if (f.method !== ALL && e.method !== f.method) return false;
    if (words.length === 0) return true;
    const haystack = `${e.item} ${e.category} ${e.method}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Master options plus any value still used by entries (e.g. deactivated ones) */
export function optionsWithUsed(
  options: readonly string[],
  used: string[]
): string[] {
  const extra = [...new Set(used.filter((v) => v && !options.includes(v)))];
  return [...options, ...extra.sort()];
}

/** Query params for the Add form to repeat an expense */
export function repeatSearch(e: ExpenseEntry): string {
  return new URLSearchParams({
    item: e.item,
    amount: String(e.amount),
    category: e.category,
    method: e.method,
    source: e.source
  }).toString();
}

export interface RepeatPrefill {
  item: string;
  amount: number;
  category: string;
  method: string;
  source: string;
}

/**
 * Reads a repeat request from the Add form's query string. Choices no longer
 * in the Master lists are dropped (left blank) rather than rejected.
 */
export function parseRepeat(
  params: URLSearchParams,
  master: MasterData
): RepeatPrefill | null {
  const item = (params.get('item') ?? '').trim().slice(0, 100);
  if (!item) return null;
  const amount = Number(params.get('amount'));
  const pick = (key: string, options: string[]) => {
    const v = params.get(key) ?? '';
    return options.includes(v) ? v : '';
  };
  return {
    item,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    category: pick('category', master.categories),
    method: pick('method', master.methods),
    source: pick('source', master.sources)
  };
}
