/**
 * Bulk-add parsing — pure, so it can be unit-tested against real agency
 * spreadsheets instead of being trusted.
 *
 * It lived inside BulkAddModal.tsx, which is a 'use client' component pulling
 * in React, lucide and the whole UI kit. Nothing could import it, so nothing
 * did, and the parser that decides which creators reach the roster had no
 * tests at all. The first real file put through it — 28 creators for Keeps —
 * would have produced three garbage roster rows.
 *
 * Everything here is a pure function of its input. No React, no fetch, no DB.
 */

// One creator headed for the roster. Only `handle` is required; the rest are
// optional and fall back to the batch defaults / endpoint defaults.
export interface BulkRow {
  /** Primary handle → account_1. Always lowercased. */
  handle: string;
  /**
   * The SAME person's other handles → account_2..5, lowercased.
   *
   * managed_creators has carried account_1..5 all along; this parser was the
   * only thing that could not express it. A real agency sheet writes them in
   * one cell — "supplementbestie, newtiktokshopcreator, supplementfairy" — and
   * before this that whole string became a single handle matching nothing.
   */
  extraHandles?: string[];
  name?: string;
  retainer?: number;
  monthly_post_requirement?: number;
}

/** A row we refused to import, and why. Shown, never silently dropped: a
 *  creator that vanishes between the spreadsheet and the roster is how someone
 *  ends up unpaid. */
export interface RejectedRow {
  raw: string;
  name?: string;
  reason: string;
}

/** A row we imported after changing it. Also shown — a silent "correction" is
 *  just a guess the operator never got to veto. */
export interface NotedRow {
  handle: string;
  note: string;
}


// ── CSV parsing (quote-aware, mirrors the single-cell parser elsewhere). ──
export function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Forgiving header aliases so a roughly-shaped spreadsheet still imports.
export const HANDLE_KEYS = ['handle', 'creator_handle', 'tiktok_handle', 'tiktok_username', 'username', 'account'];
export const NAME_KEYS = ['name', 'creator_name', 'real_name', 'full_name'];
export const RETAINER_KEYS = ['retainer', 'retainer_amount', 'monthly_retainer'];
export const POSTS_KEYS = ['monthly_post_requirement', 'posts_per_month', 'posts', 'post_requirement'];

export function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return '';
}

export function toNum(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[$,]/g, ''));
  // >= 0 so an explicit 0 (e.g. a $0 retainer) survives instead of being
  // dropped and silently replaced by the batch default downstream.
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * TikTok handles are letters, digits, underscore and period — nothing else, and
 * 2-24 characters. Anything outside that is not a handle, whatever the
 * spreadsheet says.
 */
export const HANDLE_OK = /^[a-z0-9._]{2,24}$/;

/** Values people type when they do not have a handle yet. These must never
 *  become creators: a roster row named "TBD" will never match a TikTok export,
 *  so it reads as a real creator earning $0 forever. */
export const PLACEHOLDERS = new Set(['tbd', 'tba', 'n/a', 'na', 'none', 'null', '-', '--', '?', 'unknown', 'pending', 'x']);

/**
 * Split one handle CELL into the handles it actually contains.
 *
 * Separators are comma, semicolon, pipe and newline. Deliberately NOT slash or
 * whitespace: "placeholder/joke handle - needs follow-up" is prose, and
 * splitting it would mint several garbage handles instead of one.
 */
export function splitHandleCell(cell: string): string[] {
  return cell.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Normalise ONE handle, reporting what had to change.
 *
 * A trailing parenthetical is treated as an operator's note, not part of the
 * handle — "abcdidontcare2 (placeholder/joke handle - needs follow-up)" is the
 * handle abcdidontcare2 plus a note to self. The note is surfaced rather than
 * swallowed, because the operator wrote "needs follow-up" for a reason.
 */
export function cleanHandle(raw: string): { handle: string | null; reason?: string; note?: string } {
  let h = raw.trim().replace(/^@/, '');
  let note: string | undefined;

  const withoutParens = h.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (withoutParens !== h) {
    note = `dropped the note "${h.slice(withoutParens.length).trim()}" from the handle cell`;
    h = withoutParens;
  }

  h = h.replace(/^@/, '').trim().toLowerCase();
  if (!h) return { handle: null, reason: 'the handle cell was empty' };
  if (PLACEHOLDERS.has(h)) {
    return { handle: null, reason: `"${raw.trim()}" is a placeholder, not a handle — add this creator once you have their @` };
  }
  if (!HANDLE_OK.test(h)) {
    return {
      handle: null,
      reason: `"${raw.trim()}" is not a usable handle (TikTok allows letters, digits, "." and "_", 2-24 characters)`,
    };
  }
  return { handle: h, note };
}

// Dedup by lowercased handle (keep first) so the preview + button count match
// what the server actually adds — the endpoint dedups the same way.
export function dedupeByHandle(rows: BulkRow[]): BulkRow[] {
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  for (const r of rows) {
    const k = r.handle.toLowerCase().replace(/^@/, '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export interface ParseOutcome {
  rows: BulkRow[];
  rejected: RejectedRow[];
  notes: NotedRow[];
  error: string | null;
}

export function rowsFromCsv(text: string): ParseOutcome {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], rejected: [], notes: [], error: null };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  if (!HANDLE_KEYS.some((k) => headers.includes(k))) {
    return { rows: [], rejected: [], notes: [], error: 'CSV needs a handle column (e.g. "handle" or "creator_handle").' };
  }
  const rows: BulkRow[] = [];
  const rejected: RejectedRow[] = [];
  const notes: NotedRow[] = [];

  for (const line of lines.slice(1)) {
    const vals = parseLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = vals[i] ?? ''; });
    const cell = pick(rec, HANDLE_KEYS);
    const name = pick(rec, NAME_KEYS) || undefined;

    // An empty handle cell is a blank row or a TOTALS row — a spreadsheet's
    // trailing "Total | $33,400" line has a name and a number and no handle.
    // Skipping silently is correct; those were never creators.
    if (!cell.trim()) continue;

    // One cell can hold several handles for ONE person. The first becomes
    // account_1, the rest account_2..5 — which is what those columns have
    // always been for. Before this, the whole string became one handle.
    const parts = splitHandleCell(cell);
    const good: string[] = [];
    for (const part of parts) {
      const { handle, reason, note } = cleanHandle(part);
      if (!handle) { rejected.push({ raw: part, name, reason: reason ?? 'unusable handle' }); continue; }
      if (note) notes.push({ handle, note });
      good.push(handle);
    }
    if (good.length === 0) continue;
    if (good.length > 5) {
      notes.push({ handle: good[0], note: `only the first 5 of ${good.length} handles were kept (account_1..5)` });
    }

    rows.push({
      handle: good[0],
      extraHandles: good.slice(1, 5),
      name,
      retainer: toNum(pick(rec, RETAINER_KEYS)),
      monthly_post_requirement: toNum(pick(rec, POSTS_KEYS)),
    });
  }
  return { rows, rejected, notes, error: null };
}

// Paste mode: one creator per line, optionally "handle, name".
//
// NOTE the asymmetry with CSV mode, and it is deliberate: here a comma
// separates handle from NAME, so a multi-handle cell cannot be expressed.
// Splitting on comma would turn "ericswanso, Swans" into two handles.
export function rowsFromPaste(text: string): ParseOutcome {
  const rows: BulkRow[] = [];
  const rejected: RejectedRow[] = [];
  const notes: NotedRow[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [h, ...rest] = parseLine(line);
    const name = rest.join(', ').trim() || undefined;
    const { handle, reason, note } = cleanHandle(h || '');
    if (!handle) { rejected.push({ raw: (h || line).trim(), name, reason: reason ?? 'unusable handle' }); continue; }
    if (note) notes.push({ handle, note });
    rows.push({ handle, name });
  }
  return { rows, rejected, notes, error: null };
}
