import assert from 'node:assert/strict';
import { loadDropBoard, type DropBoardCard } from '../src/lib/data/drop-board-client';
import { DROP_FORMATS } from '../src/lib/data/drop-formats';

async function main() {
const originalFetch = globalThis.fetch;
const tick = () => new Promise(resolve => setImmediate(resolve));
const pending: Array<{ id: string; resolve: (r: Response) => void }> = [];
const seen: string[] = [];
let active = 0, peak = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), 'https://fixture.invalid');
  const id = url.searchParams.get('format')!;
  assert.equal(url.searchParams.get('brand'), 'fixture');
  assert.equal(url.searchParams.get('start'), '2026-09-14');
  seen.push(id);
  active++; peak = Math.max(peak, active);
  return new Promise<Response>((resolve, reject) => {
    pending.push({ id, resolve: r => { active--; resolve(r); } });
    init?.signal?.addEventListener('abort', () => { active--; reject(new Error('Aborted')); }, { once: true });
  });
};
const cards: DropBoardCard[] = [];
const params = new URLSearchParams({ brand: 'fixture', period: 'custom', start: '2026-09-14', end: '2026-09-20' });
const run = loadDropBoard(params, new AbortController().signal, card => cards.push(card));
await tick();
assert.equal(pending.length, 3, 'Database fan-out is bounded to three formats');
const fast = pending.shift()!;
fast.resolve(Response.json({ cards: [{ id: fast.id, text: 'Ready', error: null }] }));
await tick();
assert.equal(cards.length, 1, 'A completed card appears while other formats are still pending');
assert.equal(seen.length, 4, 'Finishing a format starts the next queued format');
const slow = pending.shift()!;
slow.resolve(new Response('FUNCTION_INVOCATION_TIMEOUT', { status: 504 }));
await tick();
assert.equal(cards[1].id, slow.id);
assert.equal(cards[1].empty, false, 'Timeout must not look like an empty format');
assert.match(cards[1].error!, /took too long/);
while (cards.length < DROP_FORMATS.length) {
  const p = pending.shift()!;
  p.resolve(Response.json({ cards: [{ id: p.id, text: 'Ready', error: null }] }));
  await tick();
}
await run;
assert.equal(cards.filter(c => c.text).length, 6);
assert.equal(new Set(seen).size, 7);
assert.equal(peak, 3);
const controller = new AbortController();
let staleUpdates = 0;
const canceled = loadDropBoard(params, controller.signal, () => staleUpdates++);
controller.abort();
await canceled;
assert.equal(staleUpdates, 0, 'Changing selection/unmounting must not restore the old board');
assert.equal(seen.length, 10, 'Cancellation does not start queued formats');
globalThis.fetch = originalFetch;
console.log('PASS incremental board: bounded concurrency, completed cards survive 504, and cancellation suppresses stale results');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
