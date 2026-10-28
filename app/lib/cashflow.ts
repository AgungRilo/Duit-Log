import type { ExpenseEntry } from './types';
import type { TransferEntry } from './transfers';

export interface MethodFlow {
  method: string;
  in: number;
  out: number;
  net: number;
}

/**
 * Money in and out per payment method, busiest method first. Transfers move
 * money between methods, so they count here but cancel out in the totals.
 */
export function methodFlows(
  expenses: ExpenseEntry[],
  income: ExpenseEntry[],
  transfers: TransferEntry[] = []
): MethodFlow[] {
  const flows = new Map<string, MethodFlow>();
  const get = (method: string) => {
    const key = method || 'Unknown';
    const flow = flows.get(key) ?? { method: key, in: 0, out: 0, net: 0 };
    flows.set(key, flow);
    return flow;
  };
  for (const e of income) get(e.method).in += e.amount;
  for (const e of expenses) get(e.method).out += e.amount;
  for (const t of transfers) {
    get(t.from).out += t.amount;
    get(t.to).in += t.amount;
  }
  return [...flows.values()]
    .map((f) => ({ ...f, net: f.in - f.out }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));
}
