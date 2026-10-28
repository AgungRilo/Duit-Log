import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  filterEntries,
  hasActiveFilters,
  optionsWithUsed,
  parseRepeat,
  repeatSearch
} from './filters';
import type { ExpenseEntry } from './types';

function entry(overrides: Partial<ExpenseEntry>): ExpenseEntry {
  return {
    timestamp: '10/28/2026 08:00:00',
    item: 'Item',
    category: 'Food',
    amount: 10000,
    method: 'Cash',
    date: '10/28/2026',
    source: 'Agung',
    ...overrides
  };
}

const entries = [
  entry({ item: 'Kopi susu', category: 'Food', method: 'JAGO' }),
  entry({ item: 'Bensin', category: 'Transport', method: 'Cash' }),
  entry({ item: 'Sayur', category: 'Groceries', method: 'Cash', source: 'Family' })
];

const items = (list: ExpenseEntry[]) => list.map((e) => e.item);

describe('filterEntries', () => {
  it('returns everything with empty filters', () => {
    expect(filterEntries(entries, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('filters by source, category and method together', () => {
    expect(
      items(filterEntries(entries, { ...EMPTY_FILTERS, method: 'Cash' }))
    ).toEqual(['Bensin', 'Sayur']);
    expect(
      items(
        filterEntries(entries, {
          ...EMPTY_FILTERS,
          method: 'Cash',
          source: 'Family'
        })
      )
    ).toEqual(['Sayur']);
    expect(
      filterEntries(entries, { ...EMPTY_FILTERS, category: 'Health' })
    ).toEqual([]);
  });

  it('searches case-insensitively across item, category and method', () => {
    const q = (query: string) =>
      items(filterEntries(entries, { ...EMPTY_FILTERS, query }));
    expect(q('KOPI')).toEqual(['Kopi susu']);
    expect(q('transport')).toEqual(['Bensin']);
    expect(q('kopi jago')).toEqual(['Kopi susu']);
    expect(q('kopi cash')).toEqual([]);
    expect(q('   ')).toHaveLength(3);
  });
});

describe('hasActiveFilters', () => {
  it('ignores whitespace-only queries', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, method: 'Cash' })).toBe(true);
  });
});

describe('optionsWithUsed', () => {
  it('appends used values missing from the options, once and sorted', () => {
    expect(
      optionsWithUsed(['Food', 'Transport'], ['Food', 'Zoo', 'Old', 'Old', ''])
    ).toEqual(['Food', 'Transport', 'Old', 'Zoo']);
  });
});

describe('repeatSearch', () => {
  it('encodes the fields needed to prefill the form', () => {
    const params = new URLSearchParams(
      repeatSearch(entry({ item: 'Kopi & roti', amount: 25000 }))
    );
    expect(Object.fromEntries(params)).toEqual({
      item: 'Kopi & roti',
      amount: '25000',
      category: 'Food',
      method: 'Cash',
      source: 'Agung'
    });
  });
});

describe('parseRepeat', () => {
  const master = {
    categories: ['Food'],
    methods: ['Cash'],
    sources: ['Agung']
  };

  it('round-trips an entry through repeatSearch', () => {
    const params = new URLSearchParams(
      repeatSearch(entry({ item: 'Kopi', amount: 25000 }))
    );
    expect(parseRepeat(params, master)).toEqual({
      item: 'Kopi',
      amount: 25000,
      category: 'Food',
      method: 'Cash',
      source: 'Agung'
    });
  });

  it('returns null without an item', () => {
    expect(parseRepeat(new URLSearchParams(''), master)).toBeNull();
    expect(parseRepeat(new URLSearchParams('item=%20&amount=5'), master)).toBeNull();
  });

  it('blanks out unknown choices and bad amounts', () => {
    const params = new URLSearchParams(
      'item=Kopi&amount=-5&category=Old&method=Cash&source=Someone'
    );
    expect(parseRepeat(params, master)).toEqual({
      item: 'Kopi',
      amount: 0,
      category: '',
      method: 'Cash',
      source: ''
    });
    expect(
      parseRepeat(new URLSearchParams('item=Kopi&amount=abc'), master)?.amount
    ).toBe(0);
  });

  it('caps the item length', () => {
    const params = new URLSearchParams({ item: 'x'.repeat(150) });
    expect(parseRepeat(params, master)?.item).toHaveLength(100);
  });
});
