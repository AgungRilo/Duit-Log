import { describe, expect, it } from 'vitest';
import { methodFlows } from './cashflow';
import type { ExpenseEntry } from './types';

function entry(method: string, amount: number): ExpenseEntry {
  return {
    timestamp: '',
    item: 'x',
    category: 'Food',
    amount,
    method,
    date: '10/1/2026',
    source: 'Agung'
  };
}

describe('methodFlows', () => {
  it('nets income against spending per method, busiest first', () => {
    expect(
      methodFlows(
        [entry('JAGO', 300), entry('Cash', 50), entry('JAGO', 200)],
        [entry('JAGO', 1000), entry('', 20)]
      )
    ).toEqual([
      { method: 'JAGO', in: 1000, out: 500, net: 500 },
      { method: 'Cash', in: 0, out: 50, net: -50 },
      { method: 'Unknown', in: 20, out: 0, net: 20 }
    ]);
  });

  it('moves transfers between methods without changing the overall net', () => {
    const flows = methodFlows(
      [entry('JAGO', 300)],
      [entry('BCA', 1000)],
      [
        { row: 2, timestamp: '', date: '10/1/2026', from: 'BCA', to: 'JAGO', amount: 600, note: '' }
      ]
    );
    expect(flows).toEqual([
      { method: 'BCA', in: 1000, out: 600, net: 400 },
      { method: 'JAGO', in: 600, out: 300, net: 300 }
    ]);
    expect(flows.reduce((s, f) => s + f.net, 0)).toBe(1000 - 300);
  });

  it('is empty without entries', () => {
    expect(methodFlows([], [])).toEqual([]);
  });
});
