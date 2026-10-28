import { describe, expect, it } from 'vitest';
import {
  RECURRING_HEADERS,
  billLogDate,
  parseRecurringRows,
  pendingBills
} from './recurring';
import type { ExpenseEntry } from './types';

const master = {
  categories: ['Utilities', 'Entertainment'],
  methods: ['JAGO', 'Cash'],
  sources: ['Agung', 'Together'],
  budgets: {}
};

const rows = [
  RECURRING_HEADERS,
  ['Listrik', 'Utilities', 350000, 'JAGO', 'Together', 20, true],
  ['Netflix', 'Entertainment', '54.000', 'JAGO', 'Agung', 5, true],
  ['Gym', 'Health', 300000, 'Cash', 'Agung', 1, false],
  ['', 'Utilities', 100, 'Cash', 'Agung', 1, true],
  ['Internet', 'Utilities', 0, 'JAGO', 'Together', 10, true],
  ['Air', 'Utilities', 120000, 'Cash', 'Together', '', '']
];

function entry(item: string): ExpenseEntry {
  return {
    timestamp: '',
    item,
    category: 'Utilities',
    amount: 1,
    method: 'Cash',
    date: '10/1/2026',
    source: 'Agung'
  };
}

describe('parseRecurringRows', () => {
  it('keeps active, complete rows with their sheet row as id', () => {
    const items = parseRecurringRows(rows);
    expect(items.map((i) => [i.id, i.item, i.amount, i.day])).toEqual([
      [2, 'Listrik', 350000, 20],
      [3, 'Netflix', 54000, 5],
      [7, 'Air', 120000, 1]
    ]);
  });

  it('defaults invalid days to the 1st', () => {
    const [item] = parseRecurringRows([
      RECURRING_HEADERS,
      ['X', 'Utilities', 1, 'Cash', 'Agung', 45, true]
    ]);
    expect(item.day).toBe(1);
  });
});

describe('pendingBills', () => {
  const items = parseRecurringRows(rows);

  it('drops bills already logged by name, case-insensitively', () => {
    const bills = pendingBills(
      items,
      [entry(' netflix ')],
      '2026-10',
      '2026-10-15',
      master
    );
    expect(bills.map((b) => b.item)).toEqual(['Air', 'Listrik']);
  });

  it('sorts by due date and flags overdue bills', () => {
    const bills = pendingBills(items, [], '2026-10', '2026-10-05', master);
    expect(bills.map((b) => [b.item, b.dueDate, b.overdue])).toEqual([
      ['Air', '2026-10-01', true],
      ['Netflix', '2026-10-05', false],
      ['Listrik', '2026-10-20', false]
    ]);
  });

  it('clamps the due day to the end of short months', () => {
    const [bill] = pendingBills(
      parseRecurringRows([
        RECURRING_HEADERS,
        ['Sewa', 'Utilities', 1, 'Cash', 'Agung', 31, true]
      ]),
      [],
      '2026-02',
      '2026-02-01',
      master
    );
    expect(bill.dueDate).toBe('2026-02-28');
  });

  it('explains rows that do not match the Master lists', () => {
    const bills = pendingBills(
      parseRecurringRows([
        RECURRING_HEADERS,
        ['A', 'Health', 1, 'Cash', 'Agung', 1, true],
        ['B', 'Utilities', 1, 'BCA', 'Agung', 2, true],
        ['C', 'Utilities', 1, 'Cash', '', 3, true],
        ['D', 'Utilities', 1, 'Cash', 'Agung', 4, true]
      ]),
      [],
      '2026-10',
      '2026-10-01',
      master
    );
    expect(bills.map((b) => b.problem)).toEqual([
      'Unknown category "Health"',
      'Unknown method "BCA"',
      'Missing source',
      undefined
    ]);
  });
});

describe('billLogDate', () => {
  const billFor = (month: string, today: string) =>
    pendingBills(parseRecurringRows(rows).slice(0, 1), [], month, today, master)[0];

  it('uses today for the current month', () => {
    const bill = billFor('2026-10', '2026-10-28');
    expect(billLogDate(bill, '2026-10', '2026-10-28')).toBe('2026-10-28');
  });

  it('uses the due date when logging a past month', () => {
    const bill = billFor('2026-09', '2026-10-28');
    expect(billLogDate(bill, '2026-09', '2026-10-28')).toBe('2026-09-20');
  });
});
