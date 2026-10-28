import { describe, expect, it } from 'vitest';
import { TRANSFER_HEADERS, parseTransferRows } from './transfers';

describe('parseTransferRows', () => {
  it('converts serial dates and skips incomplete rows', () => {
    const rows = [
      TRANSFER_HEADERS,
      [46323.5, 46323, 'BCA', 'JAGO', 2000000, 'Top up'],
      ['2026-10-28 08:00:00', '10/28/2026', 'BCA', 'Cash', '500000'],
      [46323.5, 46323, 'BCA', '', 100, ''],
      [46323.5, 46323, 'BCA', 'JAGO', 0, '']
    ];
    expect(parseTransferRows(rows)).toEqual([
      {
        row: 2,
        timestamp: '10/28/2026 12:00:00',
        date: '10/28/2026',
        from: 'BCA',
        to: 'JAGO',
        amount: 2000000,
        note: 'Top up'
      },
      {
        row: 3,
        timestamp: '2026-10-28 08:00:00',
        date: '10/28/2026',
        from: 'BCA',
        to: 'Cash',
        amount: 500000,
        note: ''
      }
    ]);
  });
});
