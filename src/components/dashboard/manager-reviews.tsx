"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChoiceMenu } from "@/components/ui/choice-menu";
import { LoadingStatus } from "@/components/ui/loading-status";
import { formatCurrency } from "@/lib/utils/format";
import {
  goalProgress,
  validGoalTarget,
  validGoalMonth,
  type GoalReview,
  type GoalBrand,
} from "@/lib/data/manager-goals-model";
function GoalEditor({
  brand,
  month,
  onSaved,
}: {
  brand: GoalBrand;
  month: string;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState(
    String(brand.goal?.proposed_target ?? brand.goal?.approved_target ?? ""),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(action: "propose" | "approve") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/manager-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          month,
          action,
          target: Number(target),
          reason,
          version: brand.goal?.version ?? 0,
        }),
      });
      const response = await r.json();
      if (!r.ok) throw Error(response.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  if (!brand.canApprove && !brand.canPropose) return null;
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        {brand.canApprove ? "Set or approve target" : "Propose a target"}
      </summary>
      <div className="mt-3 grid gap-3">
        <label className="text-xs font-medium">
          Monthly managed GMV target (USD)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background p-2.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium">
          Reason, growth drivers, and support needed
          <textarea
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background p-2.5 text-sm"
            rows={3}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Changes are recorded. A proposal does not replace an approved target.
        </p>
        <div className="flex gap-2">
          {brand.canPropose && (
            <button
              disabled={
                busy ||
                !validGoalTarget(Number(target)) ||
                reason.trim().length < 3
              }
              onClick={() => save("propose")}
              className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
            >
              Submit proposal
            </button>
          )}
          {brand.canApprove && (
            <button
              disabled={
                busy ||
                !validGoalTarget(Number(target)) ||
                reason.trim().length < 3
              }
              onClick={() => save("approve")}
              className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40"
            >
              Approve target
            </button>
          )}
        </div>
        {busy && <LoadingStatus label="Saving goal" />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
export function ManagerReviews() {
  const params = useSearchParams();
  const initial = params.get("month") ?? "";
  const [month, setMonth] = useState(
    validGoalMonth(initial) ? initial : new Date().toISOString().slice(0, 7),
  );
  const [manager, setManager] = useState(params.get("manager") ?? "all");
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${month}:${refresh}`;
  const [result, setResult] = useState<{
    key: string;
    data: GoalReview | null;
    error: string;
  } | null>(null);
  const data = result?.key === requestKey ? result.data : null;
  const error = !validGoalMonth(month)
    ? "Choose a valid month."
    : result?.key === requestKey
      ? result.error
      : "";
  useEffect(() => {
    const abort = new AbortController();
    if (!validGoalMonth(month)) return;
    fetch(`/api/manager-goals?month=${month}`, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        if (!abort.signal.aborted)
          setResult({ key: requestKey, data: d, error: "" });
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setResult({ key: requestKey, data: null, error: e.message });
      });
    return () => abort.abort();
  }, [month, requestKey]);
  const rows =
    data?.brands.filter((b) => manager === "all" || b.managerId === manager) ??
    [];
  const managers = [
    ...new Map(
      (data?.brands ?? [])
        .filter((b) => b.managerId)
        .map((b) => [b.managerId!, b.managerName]),
    ).entries(),
  ];
  const approved = rows.filter((b) => b.goal?.approved_target != null);
  const target = approved.reduce(
    (s, b) => s + Number(b.goal!.approved_target),
    0,
  );
  const actual = rows.reduce((s, b) => s + (b.actual ?? 0), 0);
  const complete =
    rows.length > 0 && rows.every((b) => b.actual !== null && b.complete);
  const progress =
    approved.length === rows.length && complete
      ? goalProgress(actual, target)
      : null;
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Dashboard
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Internal agency review
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Goals & manager reviews
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monthly managed GMV targets, recorded ownership, and next steps.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs">
            Goal month
            <input
              aria-label="Goal month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="ml-2 rounded-lg border border-border bg-card p-2"
            />
          </label>
          <ChoiceMenu
            compact
            label="Review manager"
            value={manager}
            onChange={setManager}
            options={[
              { value: "all", label: "All managers" },
              ...managers.map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </header>
      {error ? (
        <div role="alert" className="rounded-xl border border-border p-5">
          {error}
          <button
            onClick={() => setRefresh((v) => v + 1)}
            className="ml-3 text-primary underline"
          >
            Retry
          </button>
        </div>
      ) : !data ? (
        <LoadingStatus
          label="Loading manager review"
          detail="Preparing monthly goals and recorded performance"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "Recorded managed GMV",
                rows.some((b) => b.actual !== null)
                  ? formatCurrency(actual)
                  : "Unavailable",
              ],
              [
                "Approved monthly targets",
                target ? formatCurrency(target) : "Not set",
              ],
              [
                "Goal attainment",
                progress ? `${progress.percent.toFixed(1)}%` : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <strong className="mt-2 block text-2xl">{value}</strong>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {approved.length}/{rows.length} brand targets approved. Performance
            covers the selected month, not the dashboard date filter.{" "}
            {complete
              ? ""
              : "Partial or missing data: totals reflect recorded activity; attainment is withheld."}{" "}
            {progress
              ? `${formatCurrency(progress.gap)} remaining to target.`
              : ""}
          </p>
          {!rows.length && (
            <p className="rounded-xl border border-border p-5 text-sm">
              No assigned brands are available in this review.
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map((b) => (
              <article
                key={b.id}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{b.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {b.managerName} ·{" "}
                      {b.goal ? "Recorded goal owner" : "Current assignment"}
                    </p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs">
                    {b.goal?.proposed_target
                      ? "Proposal pending"
                      : b.goal?.approved_target
                        ? "Approved"
                        : "Not set"}
                  </span>
                </header>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Recorded actual
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {b.actual === null
                        ? "Unavailable"
                        : formatCurrency(b.actual)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Approved target
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {b.goal?.approved_target
                        ? formatCurrency(Number(b.goal.approved_target))
                        : "Not set"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {b.through
                    ? `Data through ${b.through}${b.complete ? "" : " · Incomplete coverage"}`
                    : "No recorded performance available"}
                </p>
                {b.goal?.proposed_target && (
                  <p className="mt-3 text-sm">
                    Proposed: {formatCurrency(Number(b.goal.proposed_target))}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {b.goal.proposal_reason}
                    </span>
                  </p>
                )}
                <GoalEditor
                  key={`${b.id}:${b.goal?.version ?? 0}`}
                  brand={b}
                  month={month}
                  onSaved={() => setRefresh((v) => v + 1)}
                />
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Goal change history
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    Most recent changes (up to 200 across this month).
                  </p>
                  {data.events
                    .filter((e) => e.goal_id === b.goal?.id)
                    .map((e, i) => (
                      <div
                        key={i}
                        className="mt-2 border-l-2 border-primary/30 pl-3"
                      >
                        <strong>
                          {e.action === "approve" ? "Approved" : "Proposed"} ·{" "}
                          {formatCurrency(
                            Number(
                              e.action === "approve"
                                ? e.snapshot.approved_target
                                : e.snapshot.proposed_target,
                            ),
                          )}
                        </strong>
                        <p>{e.reason}</p>
                        <p className="text-muted-foreground">{e.actorName}</p>
                        <time className="text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </time>
                      </div>
                    ))}
                  {!b.goal && <p className="mt-2">No goal changes recorded.</p>}
                </details>
              </article>
            ))}
          </div>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Weekly commitments & context</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review wins, blockers, next actions and due dates in the existing
              weekly manager reports. Goal attainment is one part of the
              conversation, not a manager rating. Performance follows the
              current managed-creator roster; these are live reviews, not
              finalized monthly snapshots.
            </p>
            <Link
              href="/reporting/weekly"
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              Open weekly manager reports →
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
