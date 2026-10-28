import { CATEGORIES, METHODS, SOURCES } from './constants';

/** Option lists managed from the spreadsheet's `Master` tab */
export interface MasterData {
  categories: string[];
  methods: string[];
  sources: string[];
}

export const MASTER_HEADERS = ['Type', 'Name', 'Active'];

export const FALLBACK_MASTER: MasterData = {
  categories: [...CATEGORIES],
  methods: [...METHODS],
  sources: [...SOURCES]
};

const TYPE_KEYS: Record<string, keyof MasterData> = {
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

/**
 * Turns `Master` tab rows (header included) into option lists. Rows keep
 * their sheet order; unknown types are ignored. A list left empty falls back
 * to the built-in defaults so the form always has something to pick.
 */
export function parseMasterRows(rows: unknown[][]): MasterData {
  const result: MasterData = { categories: [], methods: [], sources: [] };
  for (const [type, name, active] of rows.slice(1)) {
    const key = TYPE_KEYS[String(type ?? '').trim().toLowerCase()];
    const label = String(name ?? '').trim();
    if (!key || !label || !isActive(active)) continue;
    if (!result[key].includes(label)) result[key].push(label);
  }
  for (const key of Object.keys(result) as (keyof MasterData)[]) {
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
