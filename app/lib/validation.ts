import { z } from 'zod';
import type { MasterData } from './master';

const baseSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month'),
  item: z.string().min(1, 'Item is required').max(100, 'Item too long'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .transform(Number)
    .pipe(z.number().positive('Amount must be positive'))
});

// `extra` lets an edited row keep a value that's no longer in the list
function oneOf(options: readonly string[], message: string, extra = '') {
  return z
    .string({ message })
    .refine((v) => options.includes(v) || (!!extra && v === extra), {
      message
    });
}

/** Validates a new expense against the current Master lists */
export function expenseSchema(master: MasterData) {
  return baseSchema.extend({
    category: oneOf(master.categories, 'Pick a category'),
    method: oneOf(master.methods, 'Pick a payment method'),
    source: oneOf(master.sources, 'Select a source')
  });
}

/** Validates a new income entry; categories come from IncomeCategory rows */
export function incomeSchema(master: MasterData) {
  return baseSchema.extend({
    category: oneOf(master.incomeCategories, 'Pick a category'),
    method: oneOf(master.methods, 'Pick where it was received'),
    source: oneOf(master.sources, 'Select who received it')
  });
}

// Same as expenseSchema, but also accepts the row's current category/method/source
// so entries using values no longer in the option lists can still be edited
export function expenseEditSchema(
  master: MasterData,
  current: { category: string; method: string; source: string }
) {
  return baseSchema.extend({
    category: oneOf(master.categories, 'Pick a category', current.category),
    method: oneOf(master.methods, 'Pick a payment method', current.method),
    source: oneOf(master.sources, 'Select a source', current.source)
  });
}

export type ExpenseInput = z.input<ReturnType<typeof expenseSchema>>;
export type ExpenseData = z.output<ReturnType<typeof expenseSchema>>;
