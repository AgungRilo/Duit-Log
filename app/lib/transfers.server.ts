import {
  appendRowCreatingTab,
  getSheetsClient,
  isMissingTab
} from './sheets.server';
import { log } from './logger.server';
import { monthOfSheetDate } from './dates';
import {
  TRANSFER_HEADERS,
  parseTransferRows,
  type TransferEntry
} from './transfers';

const TRANSFERS_TAB = 'Transfers';

/** Appends one transfer: [timestamp, date, from, to, amount, note] */
export async function appendTransfer(row: string[]): Promise<void> {
  await appendRowCreatingTab(TRANSFERS_TAB, TRANSFER_HEADERS, row);
}

/** Transfers dated in `month`, newest first; empty when the tab doesn't exist yet */
export async function getTransfersByMonth(
  month: string
): Promise<TransferEntry[]> {
  try {
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${TRANSFERS_TAB}'!A:F`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    });
    return parseTransferRows(res.data.values ?? [])
      .filter((t) => monthOfSheetDate(t.date) === month)
      .reverse();
  } catch (err) {
    if (isMissingTab(err)) return [];
    log('error', 'sheets_transfers_get_error', { error: (err as Error).message });
    throw err;
  }
}
