/**
 * Convert an array of plain objects to CSV and trigger a browser download.
 * - Headers are derived from the first row's keys (or an explicit `columns` arg).
 * - Values are CSV-quoted only when needed (quotes/commas/newlines).
 * - `null` and `undefined` render as empty cells.
 *
 * Usage:
 *   downloadCsv('top-creators-2026-04-22.csv', rows)
 *   downloadCsv('top-creators.csv', rows, ['creator_name', 'total_gmv'])
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if it contains a quote, comma, or newline
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<keyof T>
): string {
  if (rows.length === 0) return '';
  const cols = columns ?? (Object.keys(rows[0]) as Array<keyof T>);
  const header = cols.map((c) => escapeCell(c)).join(',');
  const body = rows
    .map((row) => cols.map((c) => escapeCell(row[c])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: Array<keyof T>
) {
  if (rows.length === 0) return;
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
