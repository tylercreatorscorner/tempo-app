"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  blankDraft,
  mondayToday,
  validWeek,
  responsibilities,
  type CoachingData,
  type CoachingAssignment,
  type CoachingReport,
  type CoachingDraft,
} from "@/lib/coaching/model";
import styles from "./workspace.module.css";

const statusLabel = {
  draft: "Draft",
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  reviewed: "Reviewed",
};
export function CoachingRecords() {
  const [week, setWeek] = useState(mondayToday);
  const [data, setData] = useState<CoachingData | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/coaching?week=${week}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (current === request.current) {
        setData(body);
        setSelected((previous) =>
          body.assignments.some((a: CoachingAssignment) => a.id === previous)
            ? previous
            : (body.assignments[0]?.id ?? ""),
        );
      }
    } catch (e) {
      if (current === request.current) {
        setData(null);
        setError(
          e instanceof Error ? e.message : "Could not load coaching records.",
        );
      }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [week]);
  const invalidate = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  useEffect(() => {
    const reset = () => {
      setData(null);
      setSelected("");
      setDirty(false);
      void load();
    };
    window.addEventListener("workspace-context-changed", reset);
    return () => window.removeEventListener("workspace-context-changed", reset);
  }, [load]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = () =>
    !dirty ||
    window.confirm("Discard unsaved changes? Save your draft to keep them.");
  async function save(payload: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDirty(false);
      setMessage("Saved to Tempo.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const assignment = data?.assignments.find((a) => a.id === selected);
  const report = data?.reports.find((r) => r.assignment_id === selected);
  const name = (id: string) =>
    data?.people.find((p) => p.user_id === id)?.name ||
    data?.people.find((p) => p.user_id === id)?.email ||
    "Team member";
  return (
    <div className={styles.workspace}>
      <PageHeader
        title="Coaching"
        subtitle="Weekly responsibilities, coach submissions and review history."
      />
      <Link href="/reporting" className={styles.back}>
        ← Back to reporting
      </Link>
      <div className={styles.brief}>
        <div>
          <span className={styles.eyebrow}>Weekly accountability</span>
          <h2>Record the work. Keep the history.</h2>
          <p>
            Coaches save their own drafts and submit for review. Each submission
            is preserved; requested changes create a new version. No messages
            are sent automatically.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Week beginning (Monday)
          <input
            className="block mt-1 rounded-md border border-border bg-card p-2 text-sm text-foreground"
            type="date"
            aria-label="Week beginning"
            value={week}
            max={mondayToday()}
            step={7}
            min="2020-01-06"
            disabled={busy}
            onChange={(e) => {
              if (!validWeek(e.target.value)) {
                setError("Choose a Monday, up to the current week.");
                return;
              }
              if (change()) {
                setDirty(false);
                setData(null);
                setWeek(e.target.value);
                setMessage("");
              }
            }}
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || loading}
          onClick={() => {
            if (change()) {
              setDirty(false);
              void load();
            }
          }}
        >
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          Select any prior week to review its submissions.
        </span>
      </div>
      {error && (
        <div role="alert" className={styles.formError}>
          {error}
          {!data && (
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          )}
        </div>
      )}
      {dirty && <p role="status" className="text-xs text-muted-foreground">Unsaved changes. Save your draft before leaving.</p>}
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {loading ? (
        <div
          role="status"
          className="rounded-xl border border-border bg-card p-6 animate-pulse"
        >
          Loading coaching records…
        </div>
      ) : (
        data && (
          <>
            {data.assignments.length === 0 ? (
              <div className={styles.card}>
                <div className={styles.sectionHead}>
                  <div>
                    <h2>No coaching assignments yet</h2>
                    <p>
                      {data.admin
                        ? "Assign a coach and reviewer to a brand below."
                        : "Your administrator needs to assign you to a brand before you can submit or review."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <section className={styles.card}>
                <div className={styles.accountability}>
                  <aside
                    className={styles.coachList}
                    aria-label="Coach assignments"
                  >
                    {data.assignments.map((a) => {
                      const r = data.reports.find(
                        (r) => r.assignment_id === a.id,
                      );
                      return (
                        <button
                          disabled={busy}
                          key={a.id}
                          aria-pressed={selected === a.id}
                          onClick={() => {
                            if (change()) {
                              setDirty(false);
                              setSelected(a.id);
                              setMessage("");
                              setError("");
                            }
                          }}
                        >
                          <span className={styles.avatar}>
                            {name(a.coach_id)[0]}
                          </span>
                          <span>
                            <strong>{name(a.coach_id)}</strong>
                            <small>
                              {
                                data.brands.find((b) => b.id === a.brand_id)
                                  ?.name
                              }
                            </small>
                            <small>
                              {r ? statusLabel[r.status] : "Not submitted"}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </aside>
                  {assignment && (
                    <ReportForm
                      key={`${assignment.id}:${week}:${report?.version ?? 0}`}
                      data={data}
                      assignment={assignment}
                      report={report}
                      week={week}
                      busy={busy}
                      save={save}
                      setDirty={setDirty}
                    />
                  )}
                </div>
              </section>
            )}
            {data.canConfigure && (
              <AssignmentForm data={data} busy={busy || dirty} save={save} />
            )}
          </>
        )
      )}
    </div>
  );
}
function ReportForm({
  data,
  assignment,
  report,
  week,
  busy,
  save,
  setDirty,
}: {
  data: CoachingData;
  assignment: CoachingAssignment;
  report?: CoachingReport;
  week: string;
  busy: boolean;
  save: (input: unknown) => Promise<void>;
  setDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<CoachingDraft>(() =>
    report?.draft?.entries ? report.draft : blankDraft(),
  );
  const [revision, setRevision] = useState("");
  const [note, setNote] = useState("");
  const versions = data.submissions.filter((s) => s.report_id === report?.id);
  const latest = versions.at(-1);
  const submission = revision
    ? versions.find((s) => s.id === revision)
    : latest;
  const review = data.reviews.find((r) => r.submission_id === submission?.id);
  const own = assignment.coach_id === data.userId;
  const editing =
    own &&
    data.canWrite &&
    !revision &&
    (!report || ["draft", "changes_requested"].includes(report.status));
  const canReview =
    !own &&
    data.canWrite &&
    (data.admin || assignment.reviewer_id === data.userId) &&
    report?.status === "submitted" &&
    !revision;
  const shown = editing ? draft : (submission?.content ?? blankDraft());
  const person = (id: string) =>
    data.people.find((p) => p.user_id === id)?.name ||
    data.people.find((p) => p.user_id === id)?.email ||
    "Team member";
  const update = (next: CoachingDraft) => {
    setDraft(next);
    setDirty(true);
  };
  const send = (action: string) =>
    save({
      action,
      assignmentId: assignment.id,
      week,
      expected: report?.version ?? 0,
      payload: action === "save" || action === "submit" ? draft : { note },
    });
  return (
    <div className={styles.submission}>
      <div className={styles.submissionHeader}>
        <div>
          <span className={styles.eyebrow}>{week}</span>
          <h3>{person(assignment.coach_id)}’s weekly report</h3>
          <p>
            {report ? statusLabel[report.status] : "Not submitted"} · Reviewer:{" "}
            {person(assignment.reviewer_id)}
          </p>
        </div>
        {versions.length > 0 && (
          <select
            disabled={busy}
            aria-label="Submission version"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
          >
            <option value="">
              {editing ? "Current draft" : "Latest submission"}
            </option>
            {versions.map((s) => (
              <option key={s.id} value={s.id}>
                Submission v{s.revision}
              </option>
            ))}
          </select>
        )}
      </div>
      {!own && !submission && (
        <p className={styles.submissionMeta}>
          This coach has not submitted a report for this week.
        </p>
      )}
      {submission && !editing && (
        <p className={styles.submissionMeta}>
          Submitted by {person(submission.submitted_by)} ·{" "}
          {new Date(submission.submitted_at).toLocaleString()} · Version{" "}
          {submission.revision}
        </p>
      )}
      {review && (
        <div className={styles.reviewRequest}>
          <strong>
            {review.decision === "reviewed" ? "Reviewed" : "Changes requested"}{" "}
            by {person(review.reviewed_by)}
          </strong>
          <p>{review.note || "No additional notes."}</p>
          <small>{new Date(review.reviewed_at).toLocaleString()}</small>
        </div>
      )}
      {responsibilities.map((task) => (
        <div className={styles.checklistItem} key={task.key}>
          <label>
            <input
              type="checkbox"
              disabled={!editing || busy}
              checked={shown.entries[task.key].done}
              onChange={(e) =>
                update({
                  ...draft,
                  entries: {
                    ...draft.entries,
                    [task.key]: {
                      ...draft.entries[task.key],
                      done: e.target.checked,
                    },
                  },
                })
              }
            />
            <span>
              <strong>{task.label}</strong>
              <small>{task.description}</small>
            </span>
          </label>
          <label className={styles.evidenceLabel} htmlFor={`coach-${task.key}`}>
            Notes or evidence
          </label>
          <textarea
            id={`coach-${task.key}`}
            maxLength={5000}
            readOnly={!editing || busy}
            value={shown.entries[task.key].evidence}
            onChange={(e) =>
              update({
                ...draft,
                entries: {
                  ...draft.entries,
                  [task.key]: {
                    ...draft.entries[task.key],
                    evidence: e.target.value,
                  },
                },
              })
            }
            placeholder="Creator names, feedback details or Discord / Loom links"
          />
        </div>
      ))}
      <div className={styles.summaryFields}>
        <div>
          <label htmlFor="summary">Weekly summary</label>
          <textarea
            id="summary"
            maxLength={5000}
            readOnly={!editing || busy}
            value={shown.summary}
            onChange={(e) => update({ ...draft, summary: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="blockers">Blockers & next steps</label>
          <textarea
            id="blockers"
            maxLength={5000}
            readOnly={!editing || busy}
            value={shown.blockers}
            onChange={(e) => update({ ...draft, blockers: e.target.value })}
          />
        </div>
      </div>
      {canReview && (
        <div className={styles.reviewer}>
          <label htmlFor="review-note">Review feedback</label>
          <textarea
            id="review-note"
            disabled={busy}
            maxLength={5000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
          <div>
            <Button
              disabled={busy || !note.trim()}
              variant="outline"
              onClick={() => void send("changes_requested")}
            >
              Request changes
            </Button>
            <Button disabled={busy} onClick={() => void send("reviewed")}>
              Mark reviewed
            </Button>
          </div>
        </div>
      )}
      <div className={styles.reviewFooter}>
        <span>
          {editing
            ? "Save a draft at any time. Explain unfinished responsibilities before submitting."
            : "Submission content is read-only. Completed checkboxes record work, not creator outcomes."}
        </span>
        {editing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void send("save")}
            >
              Save draft
            </Button>
            <Button disabled={busy} onClick={() => void send("submit")}>
              {busy ? "Saving…" : latest ? "Resubmit" : "Submit for review"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
function AssignmentForm({
  data,
  busy,
  save,
}: {
  data: CoachingData;
  busy: boolean;
  save: (input: unknown) => Promise<void>;
}) {
  const [brandId, setBrandId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Manage coaching assignments
      </summary>
      <p className="text-xs text-muted-foreground mt-2">
        Choose real team accounts. Both people must already have access to the
        brand and Reporting. A coach cannot review their own submission.
      </p>
      <form
        className="mt-4 flex flex-wrap gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ action: "assign", brandId, coachId, reviewerId });
        }}
      >
        <label className="text-xs">
          Brand
          <select
            required
            disabled={busy}
            className="block mt-1 max-w-full border border-border bg-card rounded-md p-2"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
          >
            <option value="">Select brand</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {[
          { label: "Coach", value: coachId, set: setCoachId },
          { label: "Reviewer", value: reviewerId, set: setReviewerId },
        ].map((field) => (
          <label key={field.label} className="text-xs min-w-0">
            {field.label}
            <select
              required
              disabled={busy}
              className="block mt-1 max-w-full border border-border bg-card rounded-md p-2"
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
            >
              <option value="">Select {field.label.toLowerCase()}</option>
              {data.people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name || p.email} ({p.email})
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button
          disabled={
            busy ||
            !brandId ||
            !coachId ||
            !reviewerId ||
            coachId === reviewerId
          }
          type="submit"
        >
          Add assignment
        </Button>
      </form>
    </details>
  );
}
