/**
 * Weekly client KPI report — shared types + message builders.
 *
 * PURE module: no next/headers, no supabase, no server imports. The Create
 * panel ('use client') imports it directly so the operator's edits to the
 * narrative sections re-render the preview without a server round-trip, and
 * the API route imports the same builders so what he previews is byte-identical
 * to what he copies.
 *
 * The five sections mirror the client's request verbatim and in their order:
 *   1. Total GMV, WoW absolute + %
 *   2. Total SV, WoW absolute + %
 *   3. New creator hires (count + budget)
 *   4. Creator updates
 *   5. Campaign blockers
 *
 * Sections 4 and 5 are NOT fully derivable. The generator pre-fills the
 * mechanical half of 4 (off-roster this window, inactive contracted creators)
 * and leaves 5 entirely to the operator, because nothing in the database knows
 * about complaints or organizational blockers. A section with no honest source
 * says so rather than rendering a confident zero.
 */

// ── Types (shared contract with the API route) ─────────────────────

/** A period-over-period move. `pct` is null when the prior window was zero,
 *  which renders as "new" rather than a fake or infinite percentage. */
export interface Delta {
  abs: number;
  pct: number | null;
}

export interface PairedMetric {
  store: number;
  storePrior: number;
  storeDelta: Delta;
  managed: number;
  managedPrior: number;
  managedDelta: Delta;
}

export interface RosterCreator {
  name: string;
  retainer: number;
}

export interface WeeklyKpiData {
  brandName: string;
  brandSlug: string;
  periodLabel: string;
  priorLabel: string;
  startDate: string; // yyyy-mm-dd
  endDate: string;
  periodDays: number;

  gmv: PairedMetric;
  /** SV = shoppable videos POSTED in the window. See the RPC header. */
  sv: PairedMetric;
  managedSharePct: number | null; // managed GMV as % of store GMV

  /**
   * Non-archived roster rows on this brand. ZERO is load-bearing: several
   * brands (kitsch, neurogum, earth_breeze, forchics) have store data but
   * nobody signed. "$0, down 100%" and "we have no signed creators here" are
   * different claims, and only the second one is true for those brands, so
   * every managed figure is suppressed rather than rendered as zero.
   */
  rosterSize: number;

  /**
   * Days actually present in each window. A brand-day can be missing (never
   * uploaded, or removed by the cross-brand copy repair), and a short window
   * compared against a full prior one reports the shortfall as a decline:
   * a false story told with true numbers. When the windows are uneven the
   * report says so instead of quietly understating itself.
   */
  coverage: {
    daysExpected: number;
    daysPresent: number;
    priorDaysExpected: number;
    priorDaysPresent: number;
    missingDays: string[]; // yyyy-mm-dd
  };

  rosterAdds: {
    count: number;
    withRetainer: number;
    retainerBudget: number;
    creators: RosterCreator[]; // capped at 25, see `truncated`
    truncated: number;
  };
  departures: {
    count: number;
    retainerFreed: number;
    creators: RosterCreator[];
    truncated: number;
  };
  inactive: {
    count: number;
    contractedTotal: number;
    retainerAtRisk: number;
    creators: RosterCreator[];
    truncated: number;
  };
}

/** The operator's narrative halves. Section 5 has no data source at all. */
export interface WeeklyKpiNotes {
  creatorUpdates: string;
  campaignBlockers: string;
}

// ── Formatting helpers ─────────────────────────────────────────────

export function money(n: number): string {
  const rounded = Math.round(n);
  return (rounded < 0 ? '-$' : '$') + Math.abs(rounded).toLocaleString('en-US');
}

function count(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function delta(curr: number, prior: number): Delta {
  if (prior === 0) return { abs: curr, pct: curr > 0 ? null : 0 };
  return { abs: curr - prior, pct: ((curr - prior) / prior) * 100 };
}

/**
 * "(▲ $78,990 / +19.8% WoW)". A null pct means the prior window was zero, so
 * there is no percentage to state and we say "new" instead of inventing one.
 * `fmt` renders the absolute side as money or a plain count.
 */
function deltaTag(d: Delta, fmt: (n: number) => string, periodWord: string): string {
  if (d.pct === null) return ` (new this ${periodWord})`;
  if (d.abs === 0 && d.pct === 0) return ` (flat vs prior ${periodWord})`;
  const arrow = d.abs >= 0 ? '▲' : '▼';
  const sign = d.pct >= 0 ? '+' : '';
  return ` (${arrow} ${fmt(Math.abs(d.abs))} / ${sign}${d.pct.toFixed(1)}% vs prior ${periodWord})`;
}

function periodWord(days: number): string {
  if (days <= 7) return 'week';
  if (days >= 28 && days <= 31) return 'month';
  return 'period';
}

/** "@name" for a handle-ish name, left alone for a real name with a space. */
function creatorList(creators: RosterCreator[], truncated: number): string {
  const parts = creators.map(c =>
    c.retainer > 0 ? `${c.name} (${money(c.retainer)}/mo)` : c.name,
  );
  if (truncated > 0) parts.push(`+${count(truncated)} more`);
  return parts.join(', ');
}

/**
 * One sentence describing an uneven or incomplete comparison, or null when
 * both windows are whole. Exported so the Create panel can show the same
 * warning before the operator ever copies the message.
 */
export function incompleteWindowNote(d: WeeklyKpiData): string | null {
  const c = d.coverage;
  const missNow = c.daysExpected - c.daysPresent;
  const missPrior = c.priorDaysExpected - c.priorDaysPresent;
  if (missNow <= 0 && missPrior <= 0) return null;

  const parts: string[] = [];
  if (missNow > 0) {
    const which = c.missingDays.length > 0 ? ` (${c.missingDays.join(', ')})` : '';
    parts.push(
      `this period has ${c.daysPresent} of ${c.daysExpected} days of data${which}`,
    );
  }
  if (missPrior > 0) {
    parts.push(`the comparison period has ${c.priorDaysPresent} of ${c.priorDaysExpected}`);
  }
  return (
    `Incomplete window: ${parts.join(', and ')}. ` +
    'The change figures below understate the shorter side and are not a like-for-like comparison.'
  );
}

// ── Prefill for the narrative sections ─────────────────────────────

/**
 * The mechanical half of section 4, drafted for the operator to edit. Only
 * states what has an exact source: who left the roster this window, and which
 * contracted creators posted nothing. Complaints and retainer cancellations
 * are NOT here — see the RPC header for why they cannot be.
 */
export function draftCreatorUpdates(d: WeeklyKpiData): string {
  const word = periodWord(d.periodDays);
  const lines: string[] = [];

  if (d.rosterSize === 0) {
    return [
      'No signed creators on this brand yet, so there is no roster activity to report.',
      'Add any complaints, retainer cancellations or other context here.',
    ].join('\n');
  }

  if (d.departures.count > 0) {
    lines.push(
      `${count(d.departures.count)} creator${d.departures.count === 1 ? '' : 's'} came off the roster this ${word}` +
      (d.departures.retainerFreed > 0 ? `, freeing ${money(d.departures.retainerFreed)}/mo in retainer` : '') +
      `: ${creatorList(d.departures.creators, d.departures.truncated)}.`,
    );
  }

  if (d.inactive.count > 0) {
    lines.push(
      `${count(d.inactive.count)} of ${count(d.inactive.contractedTotal)} contracted creators posted nothing this ${word}` +
      (d.inactive.retainerAtRisk > 0 ? ` (${money(d.inactive.retainerAtRisk)}/mo in retainer)` : '') +
      `: ${creatorList(d.inactive.creators, d.inactive.truncated)}.`,
    );
  } else if (d.inactive.contractedTotal > 0) {
    lines.push(`All ${count(d.inactive.contractedTotal)} contracted creators posted at least once this ${word}.`);
  }

  lines.push('Add any complaints, retainer cancellations or other context here.');
  return lines.join('\n');
}

// ── Message builders ───────────────────────────────────────────────

/**
 * Slack rendition. Slack markdown: *bold*, bullets via "•". Sections are
 * numbered to match the client's request so they can check it off item by item.
 */
export function buildWeeklyKpiSlack(d: WeeklyKpiData, notes: WeeklyKpiNotes): string {
  const word = periodWord(d.periodDays);
  const lines: string[] = [];

  lines.push(`*${d.brandName} - weekly report*`);
  lines.push(`${d.periodLabel}  (vs ${d.priorLabel})`);

  // An uneven comparison is stated up front, not buried. Without this the
  // missing days read as a decline the brand did not actually have.
  const gap = incompleteWindowNote(d);
  if (gap) {
    lines.push('');
    lines.push(`:warning: ${gap}`);
  }
  lines.push('');

  // A brand with nobody signed has no Creators Corner line to give. Saying
  // "$0" there would read as "we delivered nothing", which is a claim about
  // performance rather than the truth, which is about coverage.
  const noRoster = d.rosterSize === 0;

  // 1. Total GMV
  lines.push('*1. Total GMV*');
  lines.push(`• Store: *${money(d.gmv.store)}*${deltaTag(d.gmv.storeDelta, money, word)}`);
  lines.push(
    noRoster
      ? '• Creators Corner: no signed creators on this brand yet'
      : `• Creators Corner: *${money(d.gmv.managed)}*${deltaTag(d.gmv.managedDelta, money, word)}` +
        (d.managedSharePct !== null ? ` - ${d.managedSharePct.toFixed(0)}% of store GMV` : ''),
  );
  lines.push('');

  // 2. Total SV
  lines.push('*2. Total SV* _(shoppable videos posted)_');
  lines.push(`• Store: *${count(d.sv.store)}*${deltaTag(d.sv.storeDelta, count, word)}`);
  if (!noRoster) {
    lines.push(`• Creators Corner: *${count(d.sv.managed)}*${deltaTag(d.sv.managedDelta, count, word)}`);
  }
  lines.push('');

  // 3. New creator hires
  lines.push('*3. New creator hires*');
  if (d.rosterAdds.count === 0) {
    lines.push(`• No creators added to the roster this ${word}.`);
  } else {
    lines.push(
      `• *${count(d.rosterAdds.count)}* creator${d.rosterAdds.count === 1 ? '' : 's'} added to the roster` +
      (d.rosterAdds.withRetainer > 0
        ? `, ${count(d.rosterAdds.withRetainer)} on a retainer totalling *${money(d.rosterAdds.retainerBudget)}/mo*`
        : ', all affiliate-only (no retainer)'),
    );
    lines.push(`• ${creatorList(d.rosterAdds.creators, d.rosterAdds.truncated)}`);
  }
  lines.push('');

  // 4. Creator updates
  lines.push('*4. Creator updates*');
  const updates = notes.creatorUpdates.trim();
  lines.push(updates ? updates.split('\n').map(l => (l.trim() ? `• ${l.trim()}` : '')).filter(Boolean).join('\n') : '• Nothing to report.');
  lines.push('');

  // 5. Campaign blockers
  lines.push('*5. Campaign blockers*');
  const blockers = notes.campaignBlockers.trim();
  lines.push(blockers ? blockers.split('\n').map(l => (l.trim() ? `• ${l.trim()}` : '')).filter(Boolean).join('\n') : '• None this ' + word + '.');

  return lines.join('\n');
}

/** Discord rendition. Same content, Discord markdown (**bold**, __underline__). */
export function buildWeeklyKpiDiscord(d: WeeklyKpiData, notes: WeeklyKpiNotes): string {
  return buildWeeklyKpiSlack(d, notes)
    // Slack single-asterisk bold -> Discord double-asterisk bold.
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    // Slack _italic_ is the same in Discord, so it passes through untouched.
    ;
}
