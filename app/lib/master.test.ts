import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MASTER,
  MASTER_HEADERS,
  defaultMasterRows,
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
      sources: ['Agung']
    });
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
