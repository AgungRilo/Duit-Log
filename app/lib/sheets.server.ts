import { google } from 'googleapis';
import { log } from './logger.server';
import type { ExpenseEntry } from './types';
import { serialToString } from './dates';

// Singleton — reuse across requests in the same server instance
let _sheets: ReturnType<typeof google.sheets> | null = null;

export function getSheetsClient() {
  if (_sheets) return _sheets;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // The private key is stored with literal \n in the env var; replace with real newlines
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

export async function getAvailableMonths(): Promise<string[]> {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      fields: 'sheets.properties.title'
    });

    const titles = (res.data.sheets ?? [])
      .map((s) => s.properties?.title ?? '')
      .filter((title) => /^\d{4}-\d{2}$/.test(title));

    titles.sort();
    titles.reverse();

    log('info', 'sheets_get_months_success', {
      count: titles.length
    });
    return titles;
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_get_months_error', { error: error.message });
    throw err;
  }
}

const DEFAULT_HEADERS = [
  'Timestamp',
  'Item',
  'Category',
  'Amount (IDR)',
  'Payment Method',
  'Date',
  'Source'
];

/**
 * Creates the YYYY-MM tab if it doesn't exist yet. Duplicates the most recent
 * month tab (keeping header, formatting and column types) and clears its data;
 * falls back to a blank tab with a header row when there's nothing to copy.
 * Returns true when a new tab was created.
 */
export async function ensureMonthSheet(month: string): Promise<boolean> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)'
  });
  const monthTabs = (res.data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p) => /^\d{4}-\d{2}$/.test(p?.title ?? ''))
    .sort((a, b) => (a!.title! < b!.title! ? 1 : -1));

  if (monthTabs.some((p) => p?.title === month)) return false;

  // Copy the latest tab that is older than the new month (fall back to any)
  const template =
    monthTabs.find((p) => p!.title! < month) ?? monthTabs[0] ?? null;

  try {
    if (template?.sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              duplicateSheet: {
                sourceSheetId: template.sheetId,
                newSheetName: month,
                insertSheetIndex: 0
              }
            }
          ]
        }
      });
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${month}'!A2:G`
      });
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: month, index: 0 } } }
          ]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${month}'!A1:G1`,
        valueInputOption: 'RAW',
        requestBody: { values: [DEFAULT_HEADERS] }
      });
    }
    log('info', 'sheets_month_created', {
      month,
      template: template?.title ?? 'none'
    });
    return true;
  } catch (err) {
    const error = err as Error;
    // Another request may have created the same tab concurrently
    if (error.message.includes('already exists')) return false;
    log('error', 'sheets_month_create_error', { month, error: error.message });
    throw err;
  }
}

export async function appendExpense(
  month: string,
  row: string[]
): Promise<void> {
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${month}'!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
    log('info', 'sheets_append_success', { month });
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_append_error', { error: error.message });
    throw err;
  }
}

function toCell(cell: unknown, column: number): string {
  if (typeof cell === 'number' && column === 0) return serialToString(cell, true);
  if (typeof cell === 'number' && column === 5) return serialToString(cell, false);
  return cell == null ? '' : String(cell);
}

function toEntry(row: unknown[], rowNumber: number): ExpenseEntry {
  const cells = Array.from({ length: 7 }, (_, i) => toCell(row[i], i));
  return {
    row: rowNumber,
    timestamp: cells[0],
    item: cells[1],
    category: cells[2],
    amount: Number(cells[3]) || 0,
    method: cells[4],
    date: cells[5],
    source: cells[6]
  };
}

// Read raw values so dates don't depend on the spreadsheet's locale format
// (e.g. id-ID renders dates as D/M/YYYY)
const RAW_READ = {
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'SERIAL_NUMBER'
} as const;

export async function getExpensesByMonth(
  month: string,
  limit?: number
): Promise<ExpenseEntry[]> {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${month}'!A:G`,
      ...RAW_READ
    });
    const values = res.data.values ?? [];
    // Row 1 is the header, so data row i lives on sheet row i + 2
    const entries = values
      .slice(1)
      .map((row, i) => toEntry(row, i + 2))
      .filter((e) => e.item || e.amount);
    const bounded = limit ? entries.slice(-limit) : entries;
    return bounded.reverse();
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_get_error', { error: error.message });
    throw err;
  }
}

export async function getExpenseRow(
  month: string,
  row: number
): Promise<ExpenseEntry | null> {
  const sheets = getSheetsClient();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${month}'!A${row}:G${row}`,
      ...RAW_READ
    });
  } catch (err) {
    // Row beyond the sheet's last row, or the month tab doesn't exist
    if (/exceeds grid limits|Unable to parse range/.test((err as Error).message)) {
      return null;
    }
    throw err;
  }
  const values = res.data.values?.[0];
  if (!values || values.length === 0) return null;
  return toEntry(values, row);
}

/**
 * Overwrites columns B:G (Item … Source) of a row. The Timestamp column is
 * left untouched so the original submission time is preserved.
 */
export async function updateExpense(
  month: string,
  row: number,
  values: string[]
): Promise<void> {
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${month}'!B${row}:G${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
    log('info', 'sheets_update_success', { month, row: String(row) });
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_update_error', { error: error.message });
    throw err;
  }
}

/** Removes a row from the month tab; rows below it shift up. */
export async function deleteExpense(month: string, row: number): Promise<void> {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)'
    });
    const sheetId = res.data.sheets?.find(
      (s) => s.properties?.title === month
    )?.properties?.sheetId;
    if (sheetId == null) throw new Error(`Sheet tab '${month}' not found`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: row - 1,
                endIndex: row
              }
            }
          }
        ]
      }
    });
    log('info', 'sheets_delete_success', { month, row: String(row) });
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_delete_error', { error: error.message });
    throw err;
  }
}
