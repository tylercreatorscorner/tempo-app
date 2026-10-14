import * as XLSX from 'xlsx';

export interface WorkbookRead {
  rows: Record<string, unknown>[];
  sheetName: string | null;
  sheetCount: number;
  declaredRange: string | null;
  readRange: string | null;
  recoveredRows: number;
  rangeRepaired: boolean;
}

/**
 * Some spreadsheet exporters leave a stale dimension (for example A1:W101)
 * while writing thousands more cells. SheetJS 0.18 reads those cells but its
 * JSON utility obeys !ref, silently discarding the rest. Recalculate from the
 * cells actually present, as documented by SheetJS, before converting to rows.
 * This cannot reconstruct records that were never included in the source file.
 * Keep first-sheet semantics; different worksheets may describe different dates.
 */
export function readUploadWorkbook(bytes: ArrayBuffer): WorkbookRead {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames[0] ?? null;
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  const declaredRange = sheet?.['!ref'] ?? null;
  const empty = { rows: [], sheetName, sheetCount: workbook.SheetNames.length, declaredRange, readRange: null, recoveredRows: 0, rangeRepaired: false };
  if (!sheet) return empty;

  let original: XLSX.Range | null = null;
  if (declaredRange && /^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(declaredRange)) {
    original = XLSX.utils.decode_range(declaredRange);
  }
  const range: XLSX.Range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  const outsideRows = new Set<number>();
  for (const address of Object.keys(sheet)) {
    if (!/^[A-Z]+[1-9]\d*$/.test(address)) continue;
    const cell = sheet[address] as XLSX.CellObject | undefined;
    // Formatting-only cells do not expand the data range to a million rows.
    if (!cell || cell.t === 'z' || ((cell.v === undefined || cell.v === null || cell.v === '') && !cell.f)) continue;
    const point = XLSX.utils.decode_cell(address);
    range.s.r = Math.min(range.s.r, point.r);
    range.s.c = Math.min(range.s.c, point.c);
    range.e.r = Math.max(range.e.r, point.r);
    range.e.c = Math.max(range.e.c, point.c);
    if (original && (point.r < original.s.r || point.r > original.e.r)) outsideRows.add(point.r);
  }
  if (!Number.isFinite(range.s.r)) return empty;
  const readRange = XLSX.utils.encode_range(range);
  sheet['!ref'] = readRange;
  return {
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }),
    sheetName,
    sheetCount: workbook.SheetNames.length,
    declaredRange,
    readRange,
    recoveredRows: outsideRows.size,
    rangeRepaired: original === null || range.s.r < original.s.r || range.s.c < original.s.c || range.e.r > original.e.r || range.e.c > original.e.c,
  };
}
