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
export function mondayToday() {
  const today = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
  );
  today.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
export function validWeek(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1 &&
    value >= "2020-01-01" &&
    value <= mondayToday()
  );
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
  brands: { id: string; name: string }[];
  people: { user_id: string; name: string | null; email?: string }[];
  assignments: CoachingAssignment[];
  reports: CoachingReport[];
  submissions: CoachingSubmission[];
  reviews: CoachingReview[];
};
