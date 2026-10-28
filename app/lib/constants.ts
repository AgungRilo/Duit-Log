export const CATEGORIES = [
  'Food',
  'Transport',
  'Groceries',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Education',
  'Other'
] as const;

export const METHODS = ['Cash', 'Shopee Pay', 'JAGO'] as const;

export const SOURCES = ['Agung', 'Family', 'Together'] as const;

// Not "Transfer": moving money between your own pockets is a transfer, not income
export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Gift', 'Refund', 'Other'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Method = (typeof METHODS)[number];
export type Source = (typeof SOURCES)[number];
