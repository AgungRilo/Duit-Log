import { getSheetsClient, toEntries } from './sheets.server';
import { log } from './logger.server';
import { monthOfSheetDate } from './dates';
import type { ExpenseEntry } from './types';

const INCOME_TAB = 'Income';

// Same column layout as the monthly expense tabs, so rows parse the same way
const INCOME_HEADERS = [
  'Timestamp',
  'Item',
  'Category',
  'Amount (IDR)',
  'Method',
  'Date',
  'Source'
];

const isMissingTab = (err: unknown) =>
  (err as Error).message.includes('Unable to parse range');

async function createIncomeTab(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: INCOME_TAB } } }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${INCOME_TAB}'!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [INCOME_HEADERS] }
    });
    log('info', 'sheets_income_created', {});
  } catch (err) {
    if ((err as Error).message.includes('already exists')) return;
    throw err;
  }
}

/** Appends one income row (same columns as an expense row) */
export async function appendIncome(row: string[]): Promise<void> {
  const sheets = getSheetsClient();
  const append = () =>
    sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${INCOME_TAB}'!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
  try {
    try {
      await append();
    } catch (err) {
      if (!isMissingTab(err)) throw err;
      await createIncomeTab();
      await append();
    }
    log('info', 'sheets_income_append_success', {});
  } catch (err) {
    log('error', 'sheets_income_append_error', { error: (err as Error).message });
    throw err;
  }
}

/** Income dated in `month`, newest first; empty when the tab doesn't exist yet */
export async function getIncomeByMonth(month: string): Promise<ExpenseEntry[]> {
  try {
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${INCOME_TAB}'!A:G`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    });
    return toEntries(res.data.values ?? [])
      .filter((e) => monthOfSheetDate(e.date) === month)
      .reverse();
  } catch (err) {
    if (isMissingTab(err)) return [];
    log('error', 'sheets_income_get_error', { error: (err as Error).message });
    throw err;
  }
}
