import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MASTER,
  MASTER_HEADERS,
  defaultMasterRows,
  hasIncomeCategoryRows,
  nextFreeRow,
  parseBalance,
  parseBudget,
  parseMasterRows
} from './master';

const header = MASTER_HEADERS;

describe('parseMasterRows', () => {
  it('groups rows by type and keeps sheet order', () => {
    const result = parseMasterRows([
      header,
      ['Category', 'Food', true],
      ['Method', 'Cash', true],
      ['Category', 'Coffee', true],
      ['Source', 'Agung', true]
    ]);
    expect(result).toEqual({
      categories: ['Food', 'Coffee'],
      methods: ['Cash'],
      sources: ['Agung'],
      incomeCategories: FALLBACK_MASTER.incomeCategories,
      budgets: {},
      openingBalances: {}
    });
  });

  it('reads opening balances for active methods, keeping 0 and blanks apart', () => {
    const result = parseMasterRows([
      header,
      ['Method', 'JAGO', true, '', 5000000, 46296],
      ['Method', 'Cash', true, '', 0, '2026-10-01'],
      ['Method', 'BCA', true, '', '1.250.000', '1/10/2026'],
      ['Method', 'Shopee Pay', true, '', ''],
      ['Method', 'Old', false, '', 100],
      ['Category', 'Food', true, '', 100]
    ]);
    expect(result.openingBalances).toEqual({
      JAGO: { amount: 5000000, since: '2026-10-01' },
      Cash: { amount: 0, since: '2026-10-01' },
      BCA: { amount: 1250000, since: null }
    });
  });

  it('reads income categories separately from expense categories', () => {
    const result = parseMasterRows([
      header,
      ['IncomeCategory', 'Gaji', true],
      ['incomecategory', 'Freelance', true],
      ['IncomeCategory', 'Old', false],
      ['Category', 'Food', true]
    ]);
    expect(result.incomeCategories).toEqual(['Gaji', 'Freelance']);
    expect(result.categories).toEqual(['Food']);
  });

  it('detects whether income rows exist, even inactive ones', () => {
    expect(hasIncomeCategoryRows([header, ['Category', 'Food', true]])).toBe(false);
    expect(hasIncomeCategoryRows([header, ['IncomeCategory', 'X', false]])).toBe(true);
  });

  it('reads budgets for active categories only', () => {
    const result = parseMasterRows([
      header,
      ['Category', 'Food', true, 1500000],
      ['Category', 'Fun', true, '500.000'],
      ['Category', 'Health', true, ''],
      ['Category', 'Old', false, 900000],
      ['Method', 'Cash', true, 100]
    ]);
    expect(result.budgets).toEqual({ Food: 1500000, Fun: 500000 });
  });

  it('skips inactive rows, treating blank Active as active', () => {
    const result = parseMasterRows([
      header,
      ['Category', 'Food', true],
      ['Category', 'Old', false],
      ['Category', 'Gone', 'FALSE'],
      ['Category', 'Nope', 'tidak'],
      ['Category', 'New']
    ]);
    expect(result.categories).toEqual(['Food', 'New']);
  });

  it('trims, ignores case of type, and drops blanks and duplicates', () => {
    const result = parseMasterRows([
      header,
      ['  category ', ' Food ', true],
      ['CATEGORY', 'Food', true],
      ['Category', '', true],
      ['Category', '   ', true]
    ]);
    expect(result.categories).toEqual(['Food']);
  });

  it('ignores unknown types', () => {
    const result = parseMasterRows([
      header,
      ['IncomeCategory', 'Salary', true],
      ['Category', 'Food', true]
    ]);
    expect(result.categories).toEqual(['Food']);
  });

  it('falls back to defaults for empty lists', () => {
    expect(parseMasterRows([])).toEqual(FALLBACK_MASTER);
    const result = parseMasterRows([header, ['Method', 'BCA', true]]);
    expect(result.methods).toEqual(['BCA']);
    expect(result.categories).toEqual(FALLBACK_MASTER.categories);
  });

  it('does not share arrays with the fallback', () => {
    const result = parseMasterRows([]);
    result.categories.push('Mutated');
    expect(FALLBACK_MASTER.categories).not.toContain('Mutated');
  });
});

describe('defaultMasterRows', () => {
  it('round-trips to the fallback lists', () => {
    expect(parseMasterRows(defaultMasterRows())).toEqual(FALLBACK_MASTER);
  });
});

describe('parseBudget', () => {
  it('accepts numbers and formatted text', () => {
    expect(parseBudget(1500000)).toBe(1500000);
    expect(parseBudget('1.500.000')).toBe(1500000);
    expect(parseBudget('IDR 1,500,000')).toBe(1500000);
  });

  it('returns 0 for blank or non-positive values', () => {
    expect(parseBudget('')).toBe(0);
    expect(parseBudget(undefined)).toBe(0);
    expect(parseBudget(0)).toBe(0);
    expect(parseBudget(-10)).toBe(0);
  });
});

describe('nextFreeRow', () => {
  it('skips trailing rows that only hold unticked checkboxes', () => {
    const rows = [
      header,
      ['Category', 'Food', true],
      ['Source', 'Agung', true],
      ['', '', false],
      ['', '', 'FALSE']
    ];
    expect(nextFreeRow(rows)).toBe(4);
  });

  it('starts below the header of an empty tab', () => {
    expect(nextFreeRow([header])).toBe(2);
    expect(nextFreeRow([])).toBe(2);
  });
});

describe('parseBalance', () => {
  it('keeps zero and negative balances, null when blank', () => {
    expect(parseBalance(0)).toBe(0);
    expect(parseBalance(-250000)).toBe(-250000);
    expect(parseBalance('-250.000')).toBe(-250000);
    expect(parseBalance('IDR 1,000')).toBe(1000);
    expect(parseBalance('')).toBeNull();
    expect(parseBalance(undefined)).toBeNull();
  });
});
