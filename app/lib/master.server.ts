import { getSheetsClient } from './sheets.server';
import { log } from './logger.server';
import {
  FALLBACK_MASTER,
  defaultIncomeCategoryRows,
  defaultMasterRows,
  hasIncomeCategoryRows,
  nextFreeRow,
  parseMasterRows,
  type MasterData
} from './master';

const MASTER_TAB = 'Master';
const TTL_MS = 60 * 1000;
// Retry sooner after a failure (e.g. offline) instead of pinning the fallback
const ERROR_TTL_MS = 15 * 1000;

let cache: { data: MasterData; expires: number } | null = null;
// Concurrent requests on a cold cache share one read (and any one-off writes)
let inflight: Promise<MasterData> | null = null;

/**
 * Creates the `Master` tab seeded with the built-in lists, with a checkbox
 * column for Active. Safe to call when another request created it already.
 */
async function createMasterTab(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: MASTER_TAB } } }]
      }
    });
    const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
    const rows = defaultMasterRows();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${MASTER_TAB}'!A1:D${rows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
    if (sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              setDataValidation: {
                range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
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
    log('info', 'sheets_master_created', { rows: String(rows.length - 1) });
  } catch (err) {
    if ((err as Error).message.includes('already exists')) return;
    throw err;
  }
}

// Tabs created before budgets existed only have Type/Name/Active
async function addBudgetHeader(): Promise<void> {
  try {
    await getSheetsClient().spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${MASTER_TAB}'!D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Budget']] }
    });
    log('info', 'sheets_master_budget_header_added', {});
  } catch (err) {
    log('error', 'sheets_master_budget_header_error', {
      error: (err as Error).message
    });
  }
}

/**
 * Tabs created before income existed get the default income categories once.
 * Writes right below the last row that has a Type, rather than appending:
 * unticked checkboxes hold FALSE all the way down, which would make append
 * land at row 1000+, and a fixed position means two instances racing here
 * overwrite the same cells instead of adding duplicates.
 */
async function addIncomeCategoryRows(existing: unknown[][]): Promise<unknown[][]> {
  const rows = defaultIncomeCategoryRows();
  const start = nextFreeRow(existing);
  try {
    await getSheetsClient().spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${MASTER_TAB}'!A${start}:C${start + rows.length - 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
    log('info', 'sheets_master_income_rows_added', { rows: String(rows.length) });
    return rows;
  } catch (err) {
    log('error', 'sheets_master_income_rows_error', {
      error: (err as Error).message
    });
    return [];
  }
}

async function readMasterRows(): Promise<unknown[][]> {
  const sheets = getSheetsClient();
  const read = () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${MASTER_TAB}'!A:D`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
  try {
    const rows = (await read()).data.values ?? [];
    if (rows.length > 0 && !rows[0][3]) await addBudgetHeader();
    if (rows.length > 0 && !hasIncomeCategoryRows(rows)) {
      return [...rows, ...(await addIncomeCategoryRows(rows))];
    }
    return rows;
  } catch (err) {
    // The tab doesn't exist yet
    if (!(err as Error).message.includes('Unable to parse range')) throw err;
    await createMasterTab();
    return defaultMasterRows();
  }
}

/**
 * Category / method / source lists from the `Master` tab, cached briefly.
 * Never throws: on failure it serves the last good copy, or the built-in
 * defaults, so the form keeps working offline.
 */
export async function getMasterData(): Promise<MasterData> {
  if (cache && cache.expires > Date.now()) return cache.data;
  inflight ??= loadMasterData().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadMasterData(): Promise<MasterData> {
  const now = Date.now();
  try {
    const data = parseMasterRows(await readMasterRows());
    cache = { data, expires: now + TTL_MS };
    return data;
  } catch (err) {
    log('error', 'sheets_master_error', { error: (err as Error).message });
    const data = cache?.data ?? FALLBACK_MASTER;
    cache = { data, expires: now + ERROR_TTL_MS };
    return data;
  }
}
