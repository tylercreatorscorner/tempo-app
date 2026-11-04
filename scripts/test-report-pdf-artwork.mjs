import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const image = {};
const lookedUp = [], transformed = [];
let fail = false;
let pending = false, expire;
function sharp(bytes, options) {
  transformed.push({ bytes, options });
  const chain = { rotate: () => chain, resize: () => chain, flatten: () => chain,
    jpeg: () => chain, toBuffer: async () => { if (fail) throw Error('Unreadable image'); return Buffer.from('jpeg'); } };
  return chain;
}
const coverExports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/media/tiktok-video-cover.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: coverExports, URL, Map, Set, Date, Uint8Array });
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/pdf/report-artwork.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
  { exports, Buffer, Set, Object, Promise, setTimeout: callback => { expire = callback; return 1; }, clearTimeout: () => {}, require: name => {
    if (name === 'sharp') return sharp;
    if (name === '@/lib/media/tiktok-video-cover') return { ...coverExports, getTikTokVideoCover: async url => { lookedUp.push(url); return pending ? new Promise(() => {}) : { bytes: image }; } };
    throw Error(`Unexpected dependency ${name}`);
  } });

const url = n => `https://www.tiktok.com/@creator/video/768975294574688999${n}`;
const result = await exports.reportVideoCovers([
  { videoUrl: null }, { videoUrl: 'https://internal.invalid/secrets' },
  { videoUrl: 'https://www.tiktok.com.evil.invalid/@creator/video/7689752945746889998' },
  { videoUrl: `${url(1)}?private=1` }, { videoUrl: url(1) }, { videoUrl: url(1) },
  ...[2, 3, 4, 5, 6].map(n => ({ videoUrl: url(n) })),
]);
assert.deepEqual(lookedUp, [1, 2, 3, 4, 5].map(url), 'Only five unique canonical frozen identities may request artwork');
assert.equal(Object.keys(result).length, 5);
assert.equal(result[url(1)], 'data:image/jpeg;base64,anBlZw==');
assert.equal(transformed.length, 5, 'All source formats convert into bounded JPEG data URIs');
assert.equal(transformed[0].options.limitInputPixels, 24_000_000);
fail = true;
assert.equal(Object.keys(await exports.reportVideoCovers([{ videoUrl: url(7) }])).length, 0, 'Decoration failures never break the PDF');
pending = true;
const timed = exports.reportVideoCovers([{ videoUrl: url(8) }]);
expire();
assert.equal(Object.keys(await timed).length, 0, 'Slow artwork cannot hold the PDF past its decoration budget');
console.log('PDF artwork: canonical identities, fetch limit, conversion, deadline and graceful failure passed');
