import { data } from "react-router";
import type { Route } from "./+types/api.sync";
import { requireAuth } from "~/lib/auth.server";
import { expenseSchema } from "~/lib/validation";
import { appendExpense, ensureMonthSheet } from "~/lib/sheets.server";
import { log } from "~/lib/logger.server";

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const body = await request.json();
  const result = expenseSchema.safeParse(body);

  if (!result.success) {
    return data({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const parsed = result.data;

  await ensureMonthSheet(parsed.month);

  // Use original submission time (createdAt) if available, otherwise use current time
  const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();
  const jakartaDate = new Date(
    createdAt.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  const timestamp = `${jakartaDate.getFullYear()}-${String(jakartaDate.getMonth() + 1).padStart(2, "0")}-${String(jakartaDate.getDate()).padStart(2, "0")} ${String(jakartaDate.getHours()).padStart(2, "0")}:${String(jakartaDate.getMinutes()).padStart(2, "0")}:${String(jakartaDate.getSeconds()).padStart(2, "0")}`;

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
    await appendExpense(parsed.month, row);
    log("info", "offline_expense_synced", {
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
