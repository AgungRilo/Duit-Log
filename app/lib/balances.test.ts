import { describe, expect, it } from 'vitest';
import { pocketBalances } from './balances';
import type { TransferEntry } from './transfers';
import type { ExpenseEntry } from './types';

function entry(method: string, amount: number, date: string): ExpenseEntry {
  return {
    timestamp: '',
    item: 'x',
    category: 'Food',
    amount,
    method,
    date,
    source: 'Agung'
  };
}

function transfer(from: string, to: string, amount: number, date: string): TransferEntry {
  return { row: 2, timestamp: '', date, from, to, amount, note: '' };
}

describe('pocketBalances', () => {
  const openings = {
    BCA: { amount: 1000, since: '2026-10-01' },
    JAGO: { amount: 0, since: null }
  };

  it('adds income and transfers in, subtracts spending and transfers out', () => {
    const [bca, jago] = pocketBalances(
      openings,
      [entry('JAGO', 300, '10/5/2026'), entry('BCA', 50, '10/6/2026')],
      [entry('BCA', 10000, '10/1/2026')],
      [transfer('BCA', 'JAGO', 4000, '10/2/2026')],
      '2026-10-31'
    );
    expect(bca).toMatchObject({ in: 10000, out: 4050, balance: 1000 + 10000 - 4050 });
    expect(jago).toMatchObject({ in: 4000, out: 300, balance: 3700 });
  });

  it('ignores entries before the balance date or after the cutoff', () => {
    const [bca] = pocketBalances(
      openings,
      [entry('BCA', 100, '9/30/2026'), entry('BCA', 200, '11/1/2026'), entry('BCA', 300, '10/31/2026')],
      [],
      [],
      '2026-10-31'
    );
    expect(bca).toMatchObject({ out: 300, balance: 700 });
  });

  it('counts the opening date itself and skips methods without an opening balance', () => {
    const result = pocketBalances(
      openings,
      [entry('BCA', 100, '10/1/2026'), entry('Cash', 999, '10/1/2026')],
      [],
      [transfer('Cash', 'JAGO', 50, '10/3/2026')],
      '2026-12-31'
    );
    expect(result.map((p) => [p.method, p.balance])).toEqual([
      ['BCA', 900],
      ['JAGO', 50]
    ]);
  });

  it('skips unreadable dates', () => {
    const [bca] = pocketBalances(openings, [entry('BCA', 100, '')], [], [], '2026-12-31');
    expect(bca.balance).toBe(1000);
  });
});
