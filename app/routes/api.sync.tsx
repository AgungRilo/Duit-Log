import { data } from "react-router";
import type { Route } from "./+types/api.sync";
import { requireAuth } from "~/lib/auth.server";
import { expenseSchema, incomeSchema, transferSchema } from "~/lib/validation";
import { appendTransfer } from "~/lib/transfers.server";
import { appendIncome } from "~/lib/income.server";
import { appendExpense, ensureMonthSheet } from "~/lib/sheets.server";
import { log } from "~/lib/logger.server";
import { getMasterData } from "~/lib/master.server";
import { jakartaTimestamp } from "~/lib/dates";

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const body = await request.json();

  // Use original submission time (createdAt) if available, otherwise use current time
  const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();
  const timestamp = jakartaTimestamp(createdAt);

  if (body.kind === "transfer") {
    const result = transferSchema(await getMasterData()).safeParse(body);
    if (!result.success) {
      return data({ success: false, error: "Validation failed" }, { status: 400 });
    }
    const t = result.data;
    try {
      await appendTransfer([timestamp, t.date, t.method, t.to, String(t.amount), t.item]);
      log("info", "offline_transfer_synced", {
        from: t.method,
        to: t.to,
        amount: String(t.amount),
      });
      return data({ success: true });
    } catch (err) {
      log("error", "offline_sync_failed", { error: (err as Error).message });
      return data({ success: false, error: "Sheets API error" }, { status: 500 });
    }
  }

  const isIncome = body.kind === "income";
  const master = await getMasterData();
  const result = (isIncome ? incomeSchema(master) : expenseSchema(master)).safeParse(body);

  if (!result.success) {
    return data({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const parsed = result.data;

  if (!isIncome) await ensureMonthSheet(parsed.month);

  // ISO format so Sheets parses it correctly regardless of spreadsheet locale
  const formattedDate = parsed.date;

  const row = [
    timestamp,
    parsed.item,
    parsed.category,
    String(parsed.amount),
    parsed.method,
    formattedDate,
    parsed.source,
  ];

  try {
    if (isIncome) await appendIncome(row);
    else await appendExpense(parsed.month, row);
    log("info", "offline_expense_synced", {
      kind: isIncome ? "income" : "expense",
      source: parsed.source,
      category: parsed.category,
      amount: String(parsed.amount),
      month: parsed.month,
    });
    return data({ success: true });
  } catch (err) {
    log("error", "offline_sync_failed", { error: (err as Error).message });
    return data({ success: false, error: "Sheets API error" }, { status: 500 });
  }
}
