import { CATEGORIES, METHODS, SOURCES } from './constants';

/** Option lists managed from the spreadsheet's `Master` tab */
export interface MasterData {
  categories: string[];
  methods: string[];
  sources: string[];
  /** Monthly budget (IDR) per active category; categories without one are absent */
  budgets: Record<string, number>;
}

export const MASTER_HEADERS = ['Type', 'Name', 'Active', 'Budget'];

export const FALLBACK_MASTER: MasterData = {
  categories: [...CATEGORIES],
  methods: [...METHODS],
  sources: [...SOURCES],
  budgets: {}
};

type ListKey = 'categories' | 'methods' | 'sources';
const LIST_KEYS: ListKey[] = ['categories', 'methods', 'sources'];

const TYPE_KEYS: Record<string, ListKey> = {
  category: 'categories',
  method: 'methods',
  source: 'sources'
};

const INACTIVE = new Set(['false', 'no', 'n', '0', 'tidak', 'off']);

// Blank counts as active so new rows work without ticking the checkbox
function isActive(cell: unknown): boolean {
  if (cell === false) return false;
  return !INACTIVE.has(String(cell ?? '').trim().toLowerCase());
}

// Accepts numbers or text like "1.500.000" / "IDR 1,500,000"; 0 when blank
export function parseBudget(cell: unknown): number {
  if (typeof cell === 'number') return cell > 0 ? Math.round(cell) : 0;
  const digits = String(cell ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Turns `Master` tab rows (header included) into option lists. Rows keep
 * their sheet order; unknown types are ignored. A list left empty falls back
 * to the built-in defaults so the form always has something to pick.
 */
export function parseMasterRows(rows: unknown[][]): MasterData {
  const result: MasterData = {
    categories: [],
    methods: [],
    sources: [],
    budgets: {}
  };
  for (const [type, name, active, budget] of rows.slice(1)) {
    const key = TYPE_KEYS[String(type ?? '').trim().toLowerCase()];
    const label = String(name ?? '').trim();
    if (!key || !label || !isActive(active)) continue;
    if (!result[key].includes(label)) result[key].push(label);
    const amount = parseBudget(budget);
    if (key === 'categories' && amount > 0) result.budgets[label] = amount;
  }
  for (const key of LIST_KEYS) {
    if (result[key].length === 0) result[key] = [...FALLBACK_MASTER[key]];
  }
  return result;
}

/** Seed rows written when the `Master` tab is created */
export function defaultMasterRows(): (string | boolean)[][] {
  return [
    MASTER_HEADERS,
    ...FALLBACK_MASTER.categories.map((n) => ['Category', n, true]),
    ...FALLBACK_MASTER.methods.map((n) => ['Method', n, true]),
    ...FALLBACK_MASTER.sources.map((n) => ['Source', n, true])
  ];
}
