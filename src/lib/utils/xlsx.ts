/**
 * Build a multi-sheet .xlsx workbook from arrays of plain objects and trigger a
 * browser download. Mirrors downloadCsv (lib/utils/csv.ts) but produces a real
 * Excel workbook — typed cells, multiple tabs, a header row — instead of raw CSV.
 *
 * SheetJS (`xlsx`) is dynamically imported so it only loads when an export is
 * actually triggered, keeping it out of each page's initial bundle.
 *
 * Usage:
 *   await downloadXlsx('earnings_2026-06.xlsx', [
 *     { name: 'Brands',   rows: brandRows },
 *     { name: 'Creators', rows: creatorRows, columns: ['brand', 'name', 'gmv'] },
 *   ]);
 */

export interface XlsxSheet<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Tab name. Excel caps this at 31 chars and forbids : \ / ? * [ ] — sanitized here. */
  name: string;
  rows: T[];
  /** Optional explicit column order; defaults to the first row's keys. */
  columns?: Array<keyof T>;
}

/** Excel sheet-name rules: ≤31 chars, none of : \ / ? * [ ] */
function safeSheetName(name: string, fallbackIndex: number): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${fallbackIndex + 1}`;
}

export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const populated = sheets.filter((s) => s.rows && s.rows.length > 0);
  if (populated.length === 0) return;

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  populated.forEach((sheet, i) => {
    const ws = sheet.columns
      ? XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.columns as string[] })
      : XLSX.utils.json_to_sheet(sheet.rows);

    // De-dupe tab names (Excel rejects a workbook with two identical sheet names).
    let name = safeSheetName(sheet.name, i);
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = safeSheetName(`${sheet.name} ${n++}`, i);
    }
    usedNames.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  XLSX.writeFile(wb, filename);
}
