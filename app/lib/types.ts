export interface ExpenseEntry {
  /** Sheet row number (1-based); absent for entries not read from Sheets */
  row?: number;
  timestamp: string;
  item: string;
  category: string;
  amount: number;
  method: string;
  date: string;
  source: string;
}
