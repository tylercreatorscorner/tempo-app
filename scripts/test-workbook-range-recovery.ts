import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readUploadWorkbook } from '../src/lib/upload/read-workbook';
import { parseCreatorRows } from '../src/lib/upload/parse-rows';

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
function fixture(count: number, declaredRange?: string) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Creator name', 'Creator-attributed GMV', 'Videos'],
    ['', 'Definition of GMV', 'Definition of videos'],
    ...Array.from({ length: count }, (_, i) => [`creator${i}`, i === count - 1 ? 37.5 : 0, 1]),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Creator Data');
  const bytes: Buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  if (!declaredRange) return asArrayBuffer(bytes);
  // Patch the actual XLSX ZIP, not the in-memory worksheet. This recreates the
  // exporter defect while keeping every cell physically present in the file.
  const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
  const sheetPath = archive.FullPaths.find((path: string) => path.endsWith('/xl/worksheets/sheet1.xml'));
  assert.ok(sheetPath);
  const entry = XLSX.CFB.find(archive, sheetPath);
  assert.ok(entry);
  const xml = Buffer.from(entry.content as Uint8Array).toString('utf8');
  const patched = xml.replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="${declaredRange}"/>`);
  assert.notEqual(patched, xml);
  XLSX.CFB.utils.cfb_add(archive, sheetPath, Buffer.from(patched));
  return asArrayBuffer(XLSX.CFB.write(archive, { type: 'buffer', fileType: 'zip' }) as Buffer);
}

const broken = fixture(1500, 'A1:C101');
const previous = XLSX.read(broken, { type: 'array' });
const previousRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(previous.Sheets['Creator Data'], { defval: '' });
assert.equal(parseCreatorRows(previousRows, 'jiyu', '2026-10-11').records.length, 99);
const recovered = readUploadWorkbook(broken);
const parsed = parseCreatorRows(recovered.rows, 'jiyu', '2026-10-11');
assert.equal(parsed.records.length, 1500);
assert.equal(parsed.summary.totalGmv, 37.5);
assert.equal(parsed.records.reduce((sum, row) => sum + row.videos, 0), 1500);
assert.equal(recovered.recoveredRows, 1401);
assert.equal(recovered.rangeRepaired, true);
for (const end of [201, 401]) {
  const repaired = readUploadWorkbook(fixture(1500, `A1:C${end}`));
  assert.equal(parseCreatorRows(repaired.rows, 'jiyu', '2026-10-11').records.length, 1500);
  assert.equal(repaired.rangeRepaired, true);
}

const healthy = readUploadWorkbook(fixture(1500));
assert.deepEqual(healthy.rows, recovered.rows);
assert.equal(healthy.rangeRepaired, false);
assert.equal(healthy.recoveredRows, 0);
// A genuinely short export stays short. Never fill missing records with zeros.
assert.equal(parseCreatorRows(readUploadWorkbook(fixture(99)).rows, 'jiyu', '2026-10-11').records.length, 99);
const csv = readUploadWorkbook(asArrayBuffer(Buffer.from('Creator name,Creator-attributed GMV,Videos\nzero,0,2\nearning,12.50,1\n')));
assert.equal(csv.rows.length, 2);
assert.equal(parseCreatorRows(csv.rows, 'jiyu', '2026-10-11').summary.totalGmv, 12.5);
const multiple = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(multiple, XLSX.utils.aoa_to_sheet([['Creator name', 'Videos'], ['first-day', 1]]), 'Day one');
XLSX.utils.book_append_sheet(multiple, XLSX.utils.aoa_to_sheet([['Creator name', 'Videos'], ['second-day', 2]]), 'Day two');
const firstOnly = readUploadWorkbook(asArrayBuffer(XLSX.write(multiple, { type: 'buffer', bookType: 'xlsx' })));
assert.equal(firstOnly.sheetCount, 2);
assert.equal(firstOnly.rows.length, 1);
assert.equal(firstOnly.rows[0]['Creator name'], 'first-day');
console.log('PASS workbook recovery: real XLSX with stale 100-row range, full zero-GMV activity, healthy workbook unchanged, genuinely short export unchanged, CSV');
