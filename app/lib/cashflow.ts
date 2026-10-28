import type { ExpenseEntry } from './types';

export interface MethodFlow {
  method: string;
  in: number;
  out: number;
  net: number;
}

/** Money in and out per payment method, busiest method first */
export function methodFlows(
  expenses: ExpenseEntry[],
  income: ExpenseEntry[]
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
  return [...flows.values()]
    .map((f) => ({ ...f, net: f.in - f.out }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));
}
