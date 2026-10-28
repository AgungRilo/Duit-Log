import { describe, expect, it } from 'vitest';
import {
  dayOfMonth,
  jakartaTimestamp,
  previousMonth,
  serialToString,
  toIsoDate
} from './dates';

describe('serialToString', () => {
  it('converts a date serial to M/D/YYYY', () => {
    // 45658 = 2025-01-01 in Sheets
    expect(serialToString(45658, false)).toBe('1/1/2025');
    expect(serialToString(46323, false)).toBe('10/28/2026');
  });

  it('includes the time of day from the fraction', () => {
    expect(serialToString(45658.5, true)).toBe('1/1/2025 12:00:00');
    expect(serialToString(45658 + 0.25 + 1 / 86400, true)).toBe(
      '1/1/2025 06:00:01'
    );
  });

  it('handles leap days', () => {
    expect(serialToString(45351, false)).toBe('2/29/2024');
  });
});

describe('toIsoDate', () => {
  it('pads month and day', () => {
    expect(toIsoDate('3/7/2026', '2026-03')).toBe('2026-03-07');
    expect(toIsoDate('12/31/2026', '2026-12')).toBe('2026-12-31');
  });

  it('falls back to the first of the month when unparseable', () => {
    expect(toIsoDate('', '2026-03')).toBe('2026-03-01');
    expect(toIsoDate('2026-03-07', '2026-03')).toBe('2026-03-01');
  });
});

describe('dayOfMonth', () => {
  it('reads the day from M/D/YYYY, not the month', () => {
    expect(dayOfMonth('3/7/2026')).toBe(7);
    expect(dayOfMonth('12/31/2026')).toBe(31);
  });

  it('returns null for invalid dates', () => {
    expect(dayOfMonth('')).toBeNull();
    expect(dayOfMonth('3/0/2026')).toBeNull();
    expect(dayOfMonth('3/32/2026')).toBeNull();
    expect(dayOfMonth('3/x/2026')).toBeNull();
  });
});

describe('previousMonth', () => {
  it('steps back one month', () => {
    expect(previousMonth('2026-10')).toBe('2026-09');
  });

  it('wraps across the year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('jakartaTimestamp', () => {
  it('formats in UTC+7 regardless of the machine time zone', () => {
    expect(jakartaTimestamp(new Date('2026-10-28T03:04:05Z'))).toBe(
      '2026-10-28 10:04:05'
    );
  });

  it('rolls over to the next day and month', () => {
    expect(jakartaTimestamp(new Date('2026-10-31T17:30:00Z'))).toBe(
      '2026-11-01 00:30:00'
    );
  });

  it('uses 00 for midnight, not 24', () => {
    expect(jakartaTimestamp(new Date('2026-10-28T17:00:00Z'))).toBe(
      '2026-10-29 00:00:00'
    );
  });
});
