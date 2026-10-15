export function guardsSourceReplacement(table: string): boolean {
  return table === 'creator_performance' || table === 'video_performance';
}

/** Use whole-file metadata, never the size of the first chunk. */
export function sourceFileRowCount(fileRows: unknown, chunkRows: number, chunkCount: number | null): number | null {
  if (fileRows == null) return (chunkCount ?? 1) > 1 ? null : chunkRows;
  if (typeof fileRows !== 'number' || !Number.isSafeInteger(fileRows) || fileRows < chunkRows) {
    throw new Error('Invalid whole-file row count. Refresh the upload page and add the file again.');
  }
  return fileRows;
}

export function sourceReplacementMessage(existingRows: number, fileRows: number | null): string {
  const incoming = fileRows == null ? 'an unverified number of rows' : `only ${fileRows.toLocaleString()} rows`;
  return `Replacement stopped: this file contains ${incoming}, but this day already has ${existingRows.toLocaleString()} saved rows. ` +
    'Existing data was kept. Check the export date, filters and completeness. ' +
    'If this is a reviewed supplemental file, turn off Replace day to merge it; merging keeps unmatched existing records and requires checking the resulting totals.';
}
