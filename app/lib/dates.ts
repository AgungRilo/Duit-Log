// Pure date helpers shared by server and client code. Sheet dates are read as
// "M/D/YYYY"; form/ISO dates are "YYYY-MM-DD"; month tabs are "YYYY-MM".

const pad = (n: number) => String(n).padStart(2, '0');

// Converts a Sheets date serial number (days since 1899-12-30) to
// "M/D/YYYY" or "M/D/YYYY HH:mm:ss"
export function serialToString(serial: number, withTime: boolean): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  if (!withTime) return date;
  return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// "M/D/YYYY" -> "YYYY-MM-DD"; falls back to the first day of the month
export function toIsoDate(date: string, month: string): string {
  const parts = date.split('/');
  if (parts.length !== 3) return `${month}-01`;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Day of month from a "M/D/YYYY" sheet date, or null when unparseable
export function dayOfMonth(date: string): number | null {
  const parts = date.split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

// "YYYY-MM" -> the month before it
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Wall-clock time in Asia/Jakarta as "YYYY-MM-DD HH:mm:ss"
export function jakartaTimestamp(at: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// Today's date in Asia/Jakarta as "YYYY-MM-DD"
export function jakartaToday(at: Date = new Date()): string {
  return jakartaTimestamp(at).slice(0, 10);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
