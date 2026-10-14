# Workbook row recovery

## Verified defect

SheetJS 0.18.5 parses cells outside an XLSX worksheet's declared dimension, but
`sheet_to_json` excludes them. A real ZIP-patched fixture with 1,500 creator rows
and `A1:C101` as its declared range produced only 99 creator records before this
fix. Recalculating the populated range recovers all 1,500, including zero-GMV
creators and their posting activity. The regression also covers 200/400-row
dimensions, healthy files, genuinely short files, CSV, and separate worksheets.

Reference: https://docs.sheetjs.com/docs/miscellany/errors/#worksheet-only-includes-one-row-of-data

## Production investigation, October 14, 2026

Read-only checks of `ingestion_runs` and creator/video/product daily facts found
completed October 10/11 imports with much smaller creator populations than
October 9. Examples: Lemme 9,150 / 399 / 499; JiYu 7,471 / 1,699 / 1,799;
Physicians Choice 16,073 / 499 / 399. Many selling totals reconcile while
non-selling creator rows and posting activity fall sharply. Some selling totals
also differ, so monetary reconciliation alone cannot prove complete coverage.

These counts are consistent with truncated parsing or short source exports.
Original files were not available in the database's import metadata or locally;
the exact cause of those particular uploads is therefore unconfirmed. No facts
were fabricated, no coverage warnings were suppressed, and no imports were
marked complete merely because totals matched. Existing missing records require
reprocessing the source files. Upload idempotency hashes parsed records, so a
recovered larger payload is distinct from the old truncated payload.

## Repair behavior

Read only populated cells when deriving worksheet bounds. Keep numeric zero.
Ignore formatting-only cells. Preserve first-worksheet semantics to avoid
combining different report dates. Show range recovery and skipped-row details
in the upload log. Both manual uploads and Compass verification use this reader.

Validation: `node --import tsx scripts/test-workbook-range-recovery.ts`;
`npm run typecheck`. The regression runs in release CI.
