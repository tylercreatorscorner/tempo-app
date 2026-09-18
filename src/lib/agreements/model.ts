/** Calendar-month agreement ledger. Pure domain logic: no database or payment side effects. */
export interface AgreementTerms {
  feeCents: number;
  requiredPosts: number;
  renewal: "automatic" | "manual";
  payment: "prorated_posts" | "full_fee";
  priorPeriodCredits: "approval_required" | "not_allowed";
}
export interface TermRule {
  from: string;
  through: string | null;
  terms: AgreementTerms;
}
export interface Segment {
  from: string;
  through: string;
  terms: AgreementTerms;
}
export interface PeriodRevision {
  version: number;
  actor: string;
  recordedAt: string;
  reason: string;
  segments: Segment[];
  cancelled: boolean;
  paymentReviewRequired: boolean;
}
export interface AgreementPeriod {
  start: string;
  through: string;
  revisions: PeriodRevision[];
}
export interface AgreementLedger {
  schemaVersion: 1;
  kind: "monthly" | "campaign" | "package";
  start: string;
  deadline: string | null;
  firstPeriodEnd: string;
  finalDate: string | null;
  rules: TermRule[];
  periods: AgreementPeriod[];
}
export type AgreementCommand =
  | {
      action: "create";
      kind: AgreementLedger["kind"];
      start: string;
      deadline: string | null;
      firstPeriodEnd?: string;
      terms: AgreementTerms;
      reason: string;
    }
  | {
      action: "change";
      effective: string;
      scope: "period" | "future";
      terms: AgreementTerms;
      reason: string;
    }
  | { action: "end"; finalDate: string; reason: string }
  | { action: "renew"; through: string; reason: string }
  | { action: "advance"; through: string; reason: string };
export interface AgreementActor {
  id: string;
  now: string;
}
export function validAgreementDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2100-12-31"
  );
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const agreementMonthStart = (date: string) => date.slice(0, 7) + "-01";
export function agreementMonthEnd(date: string) {
  return iso(
    new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)),
  );
}
function dayAfter(date: string) {
  return iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000));
}
function assertDate(date: unknown) {
  if (!validAgreementDate(date)) throw Error("Choose a valid agreement date.");
}
function assertTerms(terms: AgreementTerms) {
  if (
    !terms ||
    !Number.isSafeInteger(terms.feeCents) ||
    terms.feeCents < 0 ||
    terms.feeCents > 10000000000 ||
    !Number.isInteger(terms.requiredPosts) ||
    terms.requiredPosts < 1 ||
    terms.requiredPosts > 10000 ||
    !["automatic", "manual"].includes(terms.renewal) ||
    !["prorated_posts", "full_fee"].includes(terms.payment) ||
    !["approval_required", "not_allowed"].includes(terms.priorPeriodCredits)
  )
    throw Error("Invalid agreement terms.");
}
function termsAt(ledger: AgreementLedger, date: string) {
  return [...ledger.rules]
    .reverse()
    .find(
      (rule) => rule.from <= date && (!rule.through || rule.through >= date),
    )?.terms;
}
function snapshot(
  ledger: AgreementLedger,
  period: AgreementPeriod,
  actor: AgreementActor,
  reason: string,
): PeriodRevision {
  const through =
    ledger.finalDate && ledger.finalDate < period.through
      ? ledger.finalDate
      : period.through;
  const segments: Segment[] = [];
  for (let date = period.start; date <= through; date = dayAfter(date)) {
    const terms = termsAt(ledger, date);
    if (!terms) throw Error("Agreement has a gap in its terms.");
    const previous = segments.at(-1);
    if (previous && JSON.stringify(previous.terms) === JSON.stringify(terms))
      previous.through = date;
    else segments.push({ from: date, through: date, terms: { ...terms } });
  }
  return {
    version: period.revisions.length + 1,
    actor: actor.id,
    recordedAt: actor.now,
    reason,
    segments,
    cancelled: segments.length === 0,
    // A split or partial month cannot silently become a payout calculation.
    paymentReviewRequired:
      segments.length !== 1 ||
      (ledger.kind === "monthly" &&
        (period.start !== agreementMonthStart(period.start) ||
          through !== agreementMonthEnd(period.start))),
  };
}
function addPeriod(
  ledger: AgreementLedger,
  start: string,
  actor: AgreementActor,
  reason: string,
) {
  if (ledger.periods.length >= 1200)
    throw Error("Agreement period limit reached.");
  const period: AgreementPeriod = {
    start,
    through:
      ledger.kind === "monthly"
        ? ledger.periods.length === 0
          ? ledger.firstPeriodEnd
          : agreementMonthEnd(start)
        : ledger.deadline!,
    revisions: [],
  };
  period.revisions.push(snapshot(ledger, period, actor, reason));
  ledger.periods.push(period);
}
/** Returns a new ledger; existing references/snapshots are never mutated. */
export function applyAgreementCommand(
  existing: AgreementLedger | null,
  command: AgreementCommand,
  actor: AgreementActor,
): AgreementLedger {
  if (!actor.id || !Number.isFinite(Date.parse(actor.now)))
    throw Error("A recorded actor and timestamp are required.");
  if (
    !command ||
    typeof command.reason !== "string" ||
    command.reason.trim().length < 3 ||
    command.reason.length > 2000
  )
    throw Error("Add a reason (3–2,000 characters).");
  const reason = command.reason.trim();
  if (command.action === "create") {
    if (existing) throw Error("Agreement already exists.");
    assertDate(command.start);
    assertTerms(command.terms);
    if (!["monthly", "campaign", "package"].includes(command.kind))
      throw Error("Invalid agreement type.");
    if (command.kind !== "monthly") {
      assertDate(command.deadline);
      if (
        command.deadline! < command.start ||
        command.terms.renewal !== "manual"
      )
        throw Error(
          "Fixed agreements require a deadline and no automatic renewal.",
        );
    } else if (command.deadline !== null)
      throw Error("Monthly agreements use calendar periods.");
    const firstPeriodEnd =
      command.kind === "monthly"
        ? (command.firstPeriodEnd ?? agreementMonthEnd(command.start))
        : command.deadline!;
    assertDate(firstPeriodEnd);
    if (firstPeriodEnd < command.start)
      throw Error("First period must end on or after the start date.");
    const ledger: AgreementLedger = {
      schemaVersion: 1,
      kind: command.kind,
      start: command.start,
      deadline: command.deadline,
      firstPeriodEnd,
      finalDate: null,
      rules: [
        {
          from: command.start,
          through: command.deadline,
          terms: { ...command.terms },
        },
      ],
      periods: [],
    };
    addPeriod(ledger, ledger.start, actor, reason);
    return ledger;
  }
  if (!existing) throw Error("Agreement not found.");
  const ledger = structuredClone(existing);
  if (command.action === "advance" || command.action === "renew") {
    assertDate(command.through);
    if (ledger.kind !== "monthly")
      throw Error("Fixed agreements cannot renew monthly.");
    if (command.through > actor.now.slice(0, 10))
      throw Error("Renewals cannot be materialized ahead of the current date.");
    let next = dayAfter(ledger.periods.at(-1)!.through);
    while (
      next <= command.through &&
      (!ledger.finalDate || next <= ledger.finalDate)
    ) {
      const terms = termsAt(ledger, next);
      if (!terms) throw Error("Renewal terms are missing.");
      if (terms.renewal !== "automatic" && command.action === "advance") break;
      addPeriod(ledger, next, actor, reason);
      if (command.action === "renew") break; // one explicit period per approval
      next = dayAfter(ledger.periods.at(-1)!.through);
    }
    return ledger;
  }
  let affectedFrom: string;
  if (command.action === "change") {
    assertDate(command.effective);
    assertTerms(command.terms);
    if (!["period", "future"].includes(command.scope))
      throw Error("Choose a change scope.");
    if (
      command.effective < ledger.start ||
      (ledger.finalDate && command.effective > ledger.finalDate) ||
      (ledger.deadline && command.effective > ledger.deadline)
    )
      throw Error("Effective date is outside the agreement.");
    if (
      ledger.kind !== "monthly" &&
      (command.scope !== "period" || command.terms.renewal !== "manual")
    )
      throw Error("Fixed agreements do not have monthly renewals.");
    const through =
      ledger.kind !== "monthly"
        ? ledger.deadline
        : command.scope === "period"
          ? command.effective <= ledger.firstPeriodEnd
            ? ledger.firstPeriodEnd
            : agreementMonthEnd(command.effective)
          : null;
    ledger.rules.push({
      from: command.effective,
      through,
      terms: { ...command.terms },
    });
    affectedFrom = command.effective;
    for (const period of ledger.periods) {
      if (period.through < affectedFrom || (through && period.start > through))
        continue;
      period.revisions.push(snapshot(ledger, period, actor, reason));
    }
  } else if (command.action === "end") {
    assertDate(command.finalDate);
    if (
      command.finalDate < ledger.start ||
      (ledger.deadline && command.finalDate > ledger.deadline)
    )
      throw Error("End date is outside the agreement.");
    if (ledger.finalDate)
      throw Error(
        "The end date is already recorded. A separate correction is required.",
      );
    ledger.finalDate = command.finalDate;
    for (const period of ledger.periods)
      if (period.through >= command.finalDate)
        period.revisions.push(snapshot(ledger, period, actor, reason));
  } else {
    throw Error("Unknown agreement action.");
  }
  return ledger;
}
/** Capture in a report snapshot; later ledger edits cannot alter this object. */
export function agreementPeriodSnapshot(
  ledger: AgreementLedger,
  start: string,
) {
  const period = ledger.periods.find((p) => p.start === start);
  return period
    ? structuredClone({
        start: period.start,
        through: period.through,
        ...period.revisions.at(-1)!,
      })
    : null;
}
