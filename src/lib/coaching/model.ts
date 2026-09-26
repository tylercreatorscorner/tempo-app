import { z } from "zod";
export const responsibilities = [
  {
    key: "feedback",
    label: "Creator feedback",
    description: "Feedback delivered to assigned creators.",
  },
  {
    key: "calls",
    label: "Coaching calls",
    description: "Calls held, key takeaways and follow-ups.",
  },
  {
    key: "loom",
    label: "Loom videos",
    description: "Recorded walkthroughs shared with creators.",
  },
] as const;
const entry = z
  .object({ done: z.boolean(), evidence: z.string().max(5000) })
  .strict();
export const draftSchema = z
  .object({
    entries: z.object({ feedback: entry, calls: entry, loom: entry }).strict(),
    summary: z.string().max(5000),
    blockers: z.string().max(5000),
  })
  .strict();
export type CoachingDraft = z.infer<typeof draftSchema>;
export function blankDraft(): CoachingDraft {
  return {
    entries: {
      feedback: { done: false, evidence: "" },
      calls: { done: false, evidence: "" },
      loom: { done: false, evidence: "" },
    },
    summary: "",
    blockers: "",
  };
}
export function sundayToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  today.setUTCDate(today.getUTCDate() - today.getUTCDay());
  return today.toISOString().slice(0, 10);
}
export function validWeek(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 0 &&
    value >= "2020-01-01" &&
    value <= sundayToday()
  );
}
export function weekLabel(start: string) {
  const date = new Date(start + "T12:00:00Z");
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const first = `${month(date)} ${date.getUTCDate()}`;
  const last = date.getUTCMonth() === end.getUTCMonth() && date.getUTCFullYear() === end.getUTCFullYear()
    ? `${end.getUTCDate()}` : `${month(end)} ${end.getUTCDate()}`;
  return date.getUTCFullYear() === end.getUTCFullYear()
    ? `Week of ${first} through ${last}, ${end.getUTCFullYear()}`
    : `Week of ${first}, ${date.getUTCFullYear()} through ${last}, ${end.getUTCFullYear()}`;
}
export function coachingWeeks(current = sundayToday()) {
  const result = [];
  const date = new Date(current + "T12:00:00Z");
  while (date.toISOString().slice(0, 10) >= "2020-01-05") {
    const value = date.toISOString().slice(0, 10);
    result.push({ value, label: weekLabel(value), description: value === current ? "Current week: Sunday to Saturday" : undefined });
    date.setUTCDate(date.getUTCDate() - 7);
  }
  return result;
}
export type CoachingAssignment = {
  id: string;
  brand_id: string;
  coach_id: string;
  reviewer_id: string;
  active: boolean;
};
export type CoachingReport = {
  id: string;
  assignment_id: string;
  week_start: string;
  draft: CoachingDraft;
  version: number;
  revision: number;
  status: "draft" | "submitted" | "changes_requested" | "reviewed";
  updated_at: string;
};
export type CoachingSubmission = {
  id: string;
  report_id: string;
  revision: number;
  content: CoachingDraft;
  submitted_by: string;
  submitted_at: string;
};
export type CoachingReview = {
  id: string;
  submission_id: string;
  decision: "reviewed" | "changes_requested";
  note: string;
  reviewed_by: string;
  reviewed_at: string;
};
export type CoachingData = {
  userId: string;
  admin: boolean;
  canWrite: boolean;
  canConfigure: boolean;
  brands: { id: string; name: string }[];
  people: { user_id: string; name: string | null; email?: string; avatar?: string | null }[];
  assignments: CoachingAssignment[];
  reports: CoachingReport[];
  submissions: CoachingSubmission[];
  reviews: CoachingReview[];
};
