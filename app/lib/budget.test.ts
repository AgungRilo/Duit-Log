import { describe, expect, it } from 'vitest';
import {
  budgetAlert,
  budgetLevel,
  budgetRows,
  projectMonthTotal
} from './budget';
import type { ExpenseEntry } from './types';

function entry(category: string, amount: number): ExpenseEntry {
  return {
    timestamp: '',
    item: 'x',
    category,
    amount,
    method: 'Cash',
    date: '10/1/2026',
    source: 'Agung'
  };
}

describe('budgetLevel', () => {
  it('turns amber at 80% and red at 100%', () => {
    expect(budgetLevel(799, 1000)).toBe('ok');
    expect(budgetLevel(800, 1000)).toBe('warn');
    expect(budgetLevel(999, 1000)).toBe('warn');
    expect(budgetLevel(1000, 1000)).toBe('over');
  });

  it('treats a missing budget as fine', () => {
    expect(budgetLevel(500, 0)).toBe('ok');
  });
});

describe('budgetRows', () => {
  it('sums spending per budgeted category, most used first', () => {
    const rows = budgetRows(
      [entry('Food', 300), entry('Food', 600), entry('Transport', 100), entry('Other', 50)],
      { Food: 1000, Transport: 500, Health: 200 }
    );
    expect(rows.map((r) => [r.category, r.spent, r.level])).toEqual([
      ['Food', 900, 'warn'],
      ['Transport', 100, 'ok'],
      ['Health', 0, 'ok']
    ]);
  });
});

describe('projectMonthTotal', () => {
  it('extrapolates the daily pace to the whole month', () => {
    expect(projectMonthTotal(1_000_000, 10, 31)).toBe(3_100_000);
  });

  it('returns the actual total for finished months or day 0', () => {
    expect(projectMonthTotal(500, 30, 30)).toBe(500);
    expect(projectMonthTotal(500, 0, 30)).toBe(500);
  });
});

describe('budgetAlert', () => {
  it('warns once when crossing 80%', () => {
    expect(budgetAlert(850, 100, 1000)).toBe('warn');
    expect(budgetAlert(900, 50, 1000)).toBeNull();
    expect(budgetAlert(500, 100, 1000)).toBeNull();
  });

  it('alerts on every save while over budget', () => {
    expect(budgetAlert(1000, 200, 1000)).toBe('over');
    expect(budgetAlert(1500, 100, 1000)).toBe('over');
  });
});
