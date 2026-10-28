import { serialToString } from './dates';

/** Money moved between two methods (pockets); neither income nor spending */
export interface TransferEntry {
  /** Sheet row number (1-based) */
  row: number;
  timestamp: string;
  /** "M/D/YYYY", like expense dates */
  date: string;
  from: string;
  to: string;
  amount: number;
  note: string;
}

export const TRANSFER_HEADERS = [
  'Timestamp',
  'Date',
  'From',
  'To',
  'Amount (IDR)',
  'Note'
];

function text(cell: unknown, serialWithTime?: boolean): string {
  if (typeof cell === 'number' && serialWithTime !== undefined) {
    return serialToString(cell, serialWithTime);
  }
  return String(cell ?? '').trim();
}

/** Parses `Transfers` rows read as unformatted values (header included) */
export function parseTransferRows(rows: unknown[][]): TransferEntry[] {
  return rows
    .slice(1)
    .map(([timestamp, date, from, to, amount, note], i) => ({
      row: i + 2,
      timestamp: text(timestamp, true),
      date: text(date, false),
      from: text(from),
      to: text(to),
      amount: Number(amount) || 0,
      note: text(note)
    }))
    .filter((t) => t.from && t.to && t.amount > 0);
}
