import {
  appendRowCreatingTab,
  getSheetsClient,
  isMissingTab,
  toEntries
} from './sheets.server';
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

/** Appends one income row (same columns as an expense row) */
export async function appendIncome(row: string[]): Promise<void> {
  await appendRowCreatingTab(INCOME_TAB, INCOME_HEADERS, row);
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
