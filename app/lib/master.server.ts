import { getSheetsClient } from './sheets.server';
import { log } from './logger.server';
import {
  FALLBACK_MASTER,
  defaultMasterRows,
  parseMasterRows,
  type MasterData
} from './master';

const MASTER_TAB = 'Master';
const TTL_MS = 60 * 1000;
// Retry sooner after a failure (e.g. offline) instead of pinning the fallback
const ERROR_TTL_MS = 15 * 1000;

let cache: { data: MasterData; expires: number } | null = null;

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
      range: `'${MASTER_TAB}'!A1:C${rows.length}`,
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

async function readMasterRows(): Promise<unknown[][]> {
  const sheets = getSheetsClient();
  const read = () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `'${MASTER_TAB}'!A:C`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
  try {
    return (await read()).data.values ?? [];
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
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;

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
