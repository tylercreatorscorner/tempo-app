/**
 * Regenerates src/app/api/og/fonts.ts from the .woff subsets beside the OG route.
 *
 * Run from the repo root:  node scripts/gen-og-fonts.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const WEIGHTS = ['400', '600', '800'];
const SRC = 'src/app/api/og/fonts';
const OUT = 'src/app/api/og/fonts.ts';

const parts = WEIGHTS.map((w) => {
  const bytes = readFileSync(`${SRC}/Inter-${w}.woff`);
  return { w, b64: bytes.toString('base64'), size: bytes.length };
});

const header = `// GENERATED FILE — do not hand-edit. See scripts/gen-og-fonts.mjs.
//
// The Inter subsets used by the Open Graph card, inlined as base64.
//
// WHY INLINED rather than loaded from disk: the fonts were previously read via
// fetch(new URL('./fonts/Inter-400.woff', import.meta.url)). Webpack rewrites
// that asset pattern to a ROOT-RELATIVE path (/_next/static/media/Inter-400.
// <hash>.woff), and fetch() cannot parse a relative URL outside a browser — so
// every render threw ERR_INVALID_URL and /api/og returned 500 in production
// while the code read as correct. Switching to fs.readFile would only move the
// failure to Vercel's file-tracing boundary, which is just as invisible from a
// local dev server. Bytes already in the bundle have no boundary left to fail
// at, which is worth ~124KB in a route that renders one image.
//
// Source: Inter (SIL Open Font License 1.1), latin subset.
`;

const body = parts
  .map((p) => `\nconst INTER_${p.w}_B64 =\n  '${p.b64}';`)
  .join('\n');

const footer = `

/** next/og wants an ArrayBuffer per weight; decoded once at module load. */
function decode(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export const INTER_FONTS = [
  { name: 'Inter', data: decode(INTER_400_B64), weight: 400 as const, style: 'normal' as const },
  { name: 'Inter', data: decode(INTER_600_B64), weight: 600 as const, style: 'normal' as const },
  { name: 'Inter', data: decode(INTER_800_B64), weight: 800 as const, style: 'normal' as const },
];
`;

writeFileSync(OUT, header + body + footer);
console.log(
  `wrote ${OUT} (${statSync(OUT).size} bytes) from ` +
    parts.map((p) => `${p.w}:${p.size}b`).join(' '),
);
