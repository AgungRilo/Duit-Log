import { describe, expect, it } from 'vitest';
import {
  expenseEditSchema,
  expenseSchema,
  incomeSchema,
  transferSchema
} from './validation';

const master = {
  categories: ['Food', 'Coffee'],
  methods: ['Cash', 'BCA'],
  sources: ['Agung', 'Together'],
  incomeCategories: ['Salary'],
  budgets: {}
};

const valid = {
  month: '2026-10',
  item: 'Kopi susu',
  date: '2026-10-28',
  amount: '25000',
  category: 'Coffee',
  method: 'BCA',
  source: 'Together'
};

describe('expenseSchema', () => {
  it('accepts values from the Master lists and parses the amount', () => {
    const result = expenseSchema(master).safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.amount).toBe(25000);
  });

  it('rejects values not in the Master lists', () => {
    const result = expenseSchema(master).safeParse({
      ...valid,
      category: 'Transport'
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['category'],
      message: 'Pick a category'
    });
  });

  it('reports a missing choice with the field message', () => {
    const result = expenseSchema(master).safeParse({ ...valid, method: null });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['method'],
      message: 'Pick a payment method'
    });
  });

  it('rejects bad months, dates and amounts', () => {
    const schema = expenseSchema(master);
    expect(schema.safeParse({ ...valid, month: '2026-13' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, date: '28/10/2026' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, amount: 'abc' }).success).toBe(false);
  });
});

describe('expenseEditSchema', () => {
  const current = { category: 'Legacy', method: 'Old Card', source: 'Agung' };

  it("keeps the row's current values valid even if no longer listed", () => {
    const result = expenseEditSchema(master, current).safeParse({
      ...valid,
      category: 'Legacy',
      method: 'Old Card'
    });
    expect(result.success).toBe(true);
  });

  it('still rejects other unlisted values', () => {
    const result = expenseEditSchema(master, current).safeParse({
      ...valid,
      category: 'Other'
    });
    expect(result.success).toBe(false);
  });

  it('does not accept an empty value when the current one is empty', () => {
    const result = expenseEditSchema(master, {
      ...current,
      category: ''
    }).safeParse({ ...valid, category: '' });
    expect(result.success).toBe(false);
  });
});

describe('incomeSchema', () => {
  it('uses income categories, not expense ones', () => {
    const schema = incomeSchema(master);
    expect(schema.safeParse({ ...valid, category: 'Salary' }).success).toBe(true);
    expect(schema.safeParse({ ...valid, category: 'Coffee' }).success).toBe(false);
  });
});

describe('transferSchema', () => {
  const transfer = {
    month: '2026-10',
    date: '2026-10-28',
    amount: '2000000',
    method: 'BCA',
    to: 'Cash',
    item: ' Top up '
  };

  it('accepts two different methods and trims the note', () => {
    const result = transferSchema(master).safeParse(transfer);
    expect(result.success).toBe(true);
    expect(result.data?.item).toBe('Top up');
  });

  it('allows an empty or missing note', () => {
    expect(transferSchema(master).safeParse({ ...transfer, item: '' }).success).toBe(true);
    expect(transferSchema(master).safeParse({ ...transfer, item: null }).data?.item).toBe('');
  });

  it('rejects moving money to the same method', () => {
    const result = transferSchema(master).safeParse({ ...transfer, to: 'BCA' });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['to'],
      message: 'Pick a different pocket'
    });
  });

  it('rejects unknown methods', () => {
    expect(transferSchema(master).safeParse({ ...transfer, to: 'Gopay' }).success).toBe(false);
  });
});
