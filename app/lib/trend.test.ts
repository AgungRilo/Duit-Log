import { describe, expect, it } from 'vitest';
import {
  average,
  categoryTrends,
  monthTotal,
  percentChange,
  summarizeMonth,
  trendMonths,
  trendSources
} from './trend';
import type { ExpenseEntry } from './types';

function entry(category: string, amount: number, source = 'Agung'): ExpenseEntry {
  return {
    timestamp: '',
    item: 'x',
    category,
    amount,
    method: 'Cash',
    date: '10/1/2026',
    source
  };
}

describe('summarizeMonth', () => {
  it('sums per source and category, grouping blanks as Unknown', () => {
    const s = summarizeMonth('2026-10', [
      entry('Food', 100),
      entry('Food', 50),
      entry('Food', 30, 'Family'),
      entry('', 20, '')
    ]);
    expect(s.rows).toEqual([
      ['Agung', 'Food', 150],
      ['Family', 'Food', 30],
      ['Unknown', 'Unknown', 20]
    ]);
  });
});

describe('trendMonths', () => {
  const months = ['2026-10', '2026-09', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02'];

  it('takes up to six tabs ending at the active month, oldest first', () => {
    expect(trendMonths(months, '2026-10')).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-09', '2026-10'
    ]);
  });

  it('ignores months after the active one', () => {
    expect(trendMonths(months, '2026-04')).toEqual(['2026-02', '2026-03', '2026-04']);
  });
});

describe('monthTotal', () => {
  const s = summarizeMonth('2026-10', [entry('Food', 100), entry('Fun', 40, 'Family')]);

  it('totals everything or one source', () => {
    expect(monthTotal(s)).toBe(140);
    expect(monthTotal(s, 'Family')).toBe(40);
    expect(monthTotal(s, 'Nobody')).toBe(0);
  });
});

describe('average and percentChange', () => {
  it('handle empty and zero bases', () => {
    expect(average([])).toBeNull();
    expect(average([100, 200])).toBe(150);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(150, 0)).toBeNull();
    expect(percentChange(150, null)).toBeNull();
  });
});

describe('categoryTrends', () => {
  const summaries = [
    summarizeMonth('2026-08', [entry('Food', 100), entry('Fun', 10)]),
    summarizeMonth('2026-09', [entry('Food', 300), entry('Fun', 10, 'Family')]),
    summarizeMonth('2026-10', [entry('Food', 300), entry('Health', 500)])
  ];

  it('lines up values per month and compares with the prior average', () => {
    const [food, health, fun] = categoryTrends(summaries);
    expect(health).toMatchObject({ category: 'Health', values: [0, 0, 500], avgBefore: 0, change: null });
    expect(food).toMatchObject({ category: 'Food', values: [100, 300, 300], current: 300, avgBefore: 200, change: 50 });
    expect(fun).toMatchObject({ category: 'Fun', values: [10, 10, 0], change: -100 });
  });

  it('filters by source and limits the list', () => {
    expect(categoryTrends(summaries, 'Family').map((t) => t.category)).toEqual(['Fun']);
    expect(categoryTrends(summaries, 'All', 1)).toHaveLength(1);
  });

  it('has no prior average with a single month', () => {
    const [food] = categoryTrends(summaries.slice(-1));
    expect(food.avgBefore).toBeNull();
    expect(food.change).toBeNull();
  });
});

describe('trendSources', () => {
  it('lists sources by total spending', () => {
    expect(
      trendSources([
        summarizeMonth('2026-09', [entry('Food', 10, 'Family'), entry('Food', 50)]),
        summarizeMonth('2026-10', [entry('Food', 30, 'Family')])
      ])
    ).toEqual(['Agung', 'Family']);
  });
});
