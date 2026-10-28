import { getSheetsClient } from './sheets.server';
import { log } from './logger.server';
import {
  RECURRING_HEADERS,
  parseRecurringRows,
  type RecurringItem
} from './recurring';

const RECURRING_TAB = 'Recurring';
const TTL_MS = 60 * 1000;

let cache: { items: RecurringItem[]; expires: number } | null = null;

/** Creates an empty `Recurring` tab with headers and an Active checkbox column */
async function createRecurringTab(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: RECURRING_TAB } } }]
      }
    });
    const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${RECURRING_TAB}'!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [RECURRING_HEADERS] }
    });
    if (sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              setDataValidation: {
                range: { sheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
                rule: { condition: { type: 'BOOLEAN' } }
              }
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount'
              }
            }
          ]
        }
      });
    }
    log('info', 'sheets_recurring_created', {});
  } catch (err) {
    if ((err as Error).message.includes('already exists')) return;
    throw err;
  }
}

/**
 * Active bills from the `Recurring` tab, cached briefly. Creates the tab on
 * first use. Throws on API errors so callers can tell "none" from "offline".
 */
export async function getRecurringItems(): Promise<RecurringItem[]> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.items;

  let rows: unknown[][];
  try {
    const res = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${RECURRING_TAB}'!A:G`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    rows = res.data.values ?? [];
  } catch (err) {
    if (!(err as Error).message.includes('Unable to parse range')) {
      log('error', 'sheets_recurring_error', { error: (err as Error).message });
      throw err;
    }
    await createRecurringTab();
    rows = [];
  }

  const items = parseRecurringRows(rows);
  cache = { items, expires: now + TTL_MS };
  return items;
}
