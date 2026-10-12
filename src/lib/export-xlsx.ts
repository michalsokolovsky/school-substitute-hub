import * as XLSX from "xlsx";

/** Today as YYYY-MM-DD, for file names. */
export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Downloads rows as an .xlsx file: right-to-left sheet, columns sized to their content. */
export function downloadXlsx(
  fileName: string,
  sheetName: string,
  rows: Record<string, string | number>[],
) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] ?? {});
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.min(
      40,
      Math.max(header.length, ...rows.map((row) => String(row[header] ?? "").length)) + 2,
    ),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, fileName);
}
