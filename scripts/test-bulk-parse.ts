/**
 * Bulk-add parser tests.
 *
 * The fixture is a REAL agency spreadsheet — the Keeps retainer roster, 28
 * creators — not an invented one. Every awkward thing in it is something an
 * operator actually typed: a handle with a note in parentheses, a "TBD"
 * placeholder, three handles for one person in a single cell, "$2,200" with a
 * currency symbol and a thousands comma, a blank row, and a trailing "Total"
 * line that is not a creator.
 *
 * Before this parser existed, that file produced three garbage roster rows and
 * reported success.
 *
 * Run: npx tsx scripts/test-bulk-parse.ts
 */
import { rowsFromCsv, rowsFromPaste, dedupeByHandle, cleanHandle } from '../src/lib/roster/bulk-parse';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Verbatim, including the trailing Total row and the blank line before it.
const KEEPS_CSV = [
  'handle,name,retainer,posts per month',
  'ericswanso,Swans,"$2,200",30',
  'icemom43,Faye Senne,$300,30',
  'I.see.you.dancing,maxeli,$600,30',
  'abcdidontcare2 (placeholder/joke handle - needs follow-up),serena,"$2,500",30',
  'Dealsfromjack,jack.batts,"$5,000",30',
  'Alex.miller._,Randie,$500,15',
  'TBD,Tyler Mete,"$1,000",30',
  '"supplementbestie, newtiktokshopcreator, supplementfairy",Denichard,"$1,500",30',
  'seb.heatlhlifestyle,Sebastian,$400,30',
  ',,,',
  ',Total,"$33,400",',
].join('\n');

console.log('the Keeps roster, end to end');
{
  const out = rowsFromCsv(KEEPS_CSV);
  check('the header row is understood', out.error === null, out.error ?? '');

  const byHandle = new Map(out.rows.map((r) => [r.handle, r]));

  // ── The two rows that are not creators ──────────────────────────────────
  check(
    'the blank row and the "Total" row never become creators',
    !out.rows.some((r) => /total/i.test(r.handle)) && !out.rows.some((r) => r.name === 'Total'),
    out.rows.map((r) => r.handle).join(','),
  );

  // ── Money and counts survive their formatting ───────────────────────────
  check('"$2,200" parses to 2200', byHandle.get('ericswanso')?.retainer === 2200, String(byHandle.get('ericswanso')?.retainer));
  check('"$5,000" parses to 5000', byHandle.get('dealsfromjack')?.retainer === 5000, String(byHandle.get('dealsfromjack')?.retainer));
  check('a non-default post count survives', byHandle.get('alex.miller._')?.monthly_post_requirement === 15, String(byHandle.get('alex.miller._')?.monthly_post_requirement));

  // ── Case ────────────────────────────────────────────────────────────────
  // TikTok handles are lowercase and creator_performance.creator_name is bare
  // lowercase. Storing "Dealsfromjack" is how a creator reads $0 forever.
  check('handles are lowercased', out.rows.every((r) => r.handle === r.handle.toLowerCase()), out.rows.map((r) => r.handle).join(','));
  check('...including one that was mixed case in the sheet', byHandle.has('i.see.you.dancing'));

  // ── Three handles, one person ───────────────────────────────────────────
  const denichard = out.rows.find((r) => r.name === 'Denichard');
  check('a multi-handle cell becomes ONE creator', !!denichard && out.rows.filter((r) => r.name === 'Denichard').length === 1);
  check('...whose first handle is account_1', denichard?.handle === 'supplementbestie', denichard?.handle);
  check(
    '...and whose other two become account_2..5',
    JSON.stringify(denichard?.extraHandles) === JSON.stringify(['newtiktokshopcreator', 'supplementfairy']),
    JSON.stringify(denichard?.extraHandles),
  );
  check('...and the whole cell never becomes a single handle', !out.rows.some((r) => r.handle.includes(',')));

  // ── The annotated handle ────────────────────────────────────────────────
  check('a parenthetical note is stripped from the handle', byHandle.has('abcdidontcare2'), out.rows.map((r) => r.handle).join(','));
  check('...and the note is REPORTED, not silently swallowed', out.notes.some((n) => n.handle === 'abcdidontcare2'), JSON.stringify(out.notes));
  check('...so the annotation never becomes part of the handle', !out.rows.some((r) => r.handle.includes('(') || r.handle.includes(' ')));

  // ── The placeholder ─────────────────────────────────────────────────────
  check('"TBD" is refused', !out.rows.some((r) => r.handle === 'tbd'));
  check('...and refused OUT LOUD, naming the row', out.rejected.some((r) => /tbd/i.test(r.raw)), JSON.stringify(out.rejected));
  check('...carrying the name so the operator knows who is missing', out.rejected.some((r) => r.name === 'Tyler Mete'), JSON.stringify(out.rejected));

  // ── The count ───────────────────────────────────────────────────────────
  // 9 handle-bearing rows in the fixture, minus TBD = 8 creators.
  check('the right number of creators survive', out.rows.length === 8, `${out.rows.length}: ${out.rows.map((r) => r.handle).join(',')}`);
}

console.log('cleanHandle, the unit');
{
  check('strips a leading @', cleanHandle('@ericswanso').handle === 'ericswanso');
  check('lowercases', cleanHandle('Dealsfromjack').handle === 'dealsfromjack');
  check('keeps dots and underscores', cleanHandle('alex.miller._').handle === 'alex.miller._');
  check('refuses an empty cell', cleanHandle('   ').handle === null);
  check('refuses "N/A"', cleanHandle('N/A').handle === null);
  check('refuses a one-character handle', cleanHandle('x').handle === null);
  check('refuses a handle with a space', cleanHandle('two words').handle === null);
  check('...and says why, quoting what was typed', (cleanHandle('two words').reason ?? '').includes('two words'));
  // A misspelling is NOT our business to correct — seb.heatlhlifestyle is the
  // creator's actual handle, typo and all, and "fixing" it would break the join.
  check('a plausible-looking typo is left alone', cleanHandle('seb.heatlhlifestyle').handle === 'seb.heatlhlifestyle');
}

console.log('paste mode');
{
  // Comma separates handle from NAME here, so it must NOT split into handles.
  const out = rowsFromPaste('ericswanso, Swans\n@icemom43, Faye Senne\nTBD, nobody');
  check('a comma separates handle from name, not handle from handle', out.rows.length === 2, JSON.stringify(out.rows));
  check('...taking the name after it', out.rows[0]?.name === 'Swans', out.rows[0]?.name);
  check('...and the @ is stripped', out.rows[1]?.handle === 'icemom43', out.rows[1]?.handle);
  check('...and a placeholder is still refused', out.rejected.length === 1, JSON.stringify(out.rejected));
}

console.log('dedup');
{
  const deduped = dedupeByHandle([
    { handle: 'ericswanso' }, { handle: 'ericswanso' }, { handle: 'icemom43' },
  ]);
  check('a repeated handle is kept once', deduped.length === 2, String(deduped.length));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
