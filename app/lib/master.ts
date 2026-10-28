import { CATEGORIES, INCOME_CATEGORIES, METHODS, SOURCES } from './constants';
import { serialToString, toIsoDate } from './dates';

/** Option lists managed from the spreadsheet's `Master` tab */
export interface MasterData {
  categories: string[];
  methods: string[];
  sources: string[];
  incomeCategories: string[];
  /** Monthly budget (IDR) per active category; categories without one are absent */
  budgets: Record<string, number>;
  /** Starting balance per active method; methods without one are absent */
  openingBalances: Record<string, OpeningBalance>;
}

export interface OpeningBalance {
  amount: number;
  /** "YYYY-MM-DD" the amount was true on; null counts every entry */
  since: string | null;
}

export const MASTER_HEADERS = [
  'Type',
  'Name',
  'Active',
  'Budget',
  'Opening balance',
  'Balance date'
];

export const FALLBACK_MASTER: MasterData = {
  categories: [...CATEGORIES],
  methods: [...METHODS],
  sources: [...SOURCES],
  incomeCategories: [...INCOME_CATEGORIES],
  budgets: {},
  openingBalances: {}
};

type ListKey = 'categories' | 'methods' | 'sources' | 'incomeCategories';
const LIST_KEYS: ListKey[] = ['categories', 'methods', 'sources', 'incomeCategories'];

const TYPE_KEYS: Record<string, ListKey> = {
  category: 'categories',
  method: 'methods',
  source: 'sources',
  incomecategory: 'incomeCategories'
};

/** Whether any row (active or not) defines income categories */
export function hasIncomeCategoryRows(rows: unknown[][]): boolean {
  return rows
    .slice(1)
    .some(([type]) => String(type ?? '').trim().toLowerCase() === 'incomecategory');
}

/** 1-based sheet row just below the last row that has a Type */
export function nextFreeRow(rows: unknown[][]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i]?.[0] ?? '').trim()) return i + 2;
  }
  return 2;
}

/** Rows appended to an existing Master tab that predates income */
export function defaultIncomeCategoryRows(): (string | boolean)[][] {
  return FALLBACK_MASTER.incomeCategories.map((n) => ['IncomeCategory', n, true]);
}

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

// Unlike budgets, 0 is a real balance and minus signs are kept; blank means unset
export function parseBalance(cell: unknown): number | null {
  if (typeof cell === 'number') return Math.round(cell);
  const text = String(cell ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  return text.startsWith('-') ? -Number(digits) : Number(digits);
}

// A date serial (as Sheets stores typed dates) or "YYYY-MM-DD" text
export function parseBalanceDate(cell: unknown): string | null {
  if (typeof cell === 'number' && cell > 0) {
    return toIsoDate(serialToString(cell, false), '');
  }
  const text = String(cell ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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
    incomeCategories: [],
    budgets: {},
    openingBalances: {}
  };
  for (const [type, name, active, budget, opening, openingDate] of rows.slice(1)) {
    const key = TYPE_KEYS[String(type ?? '').trim().toLowerCase()];
    const label = String(name ?? '').trim();
    if (!key || !label || !isActive(active)) continue;
    if (!result[key].includes(label)) result[key].push(label);
    const amount = parseBudget(budget);
    if (key === 'categories' && amount > 0) result.budgets[label] = amount;
    const balance = parseBalance(opening);
    if (key === 'methods' && balance !== null) {
      result.openingBalances[label] = {
        amount: balance,
        since: parseBalanceDate(openingDate)
      };
    }
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
    ...FALLBACK_MASTER.sources.map((n) => ['Source', n, true]),
    ...defaultIncomeCategoryRows()
  ];
}
