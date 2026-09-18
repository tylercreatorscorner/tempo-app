"use client";

import { useId, useState } from "react";
import { ArrowRight, Check, History, Plus, Repeat2, X } from "lucide-react";
import { ChoiceMenu } from "@/components/ui/choice-menu";
import { agreementMonthEnd, validAgreementDate } from "@/lib/agreements/model";
import styles from "./agreement-preview.module.css";

type Brand = { value: string; label: string };
type Terms = {
  brand: string;
  kind: string;
  amount: string;
  posts: string;
  start: string;
  firstPeriodEnd: string;
  end: string;
  renewal: string;
  proration: string;
  credits: string;
};
type Revision = {
  terms: Terms;
  action: string;
  effective: string;
  scope: string;
  reason: string;
};
const money = (value: string) =>
  Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`;
}
const kinds = [
  { value: "monthly", label: "Monthly retainer" },
  { value: "campaign", label: "Fixed-date campaign" },
  { value: "package", label: "Deliverable package" },
];

/** Interaction prototype only. Never calls a mutation endpoint or persists financial terms. */
export function AgreementPreview({
  brands,
  today,
}: {
  brands: Brand[];
  today: string;
}) {
  const id = useId();
  const initial: Terms = {
    brand: brands[0]?.value ?? "",
    kind: "monthly",
    amount: "",
    posts: "",
    start: monthStart(today),
    firstPeriodEnd: agreementMonthEnd(today),
    end: "",
    renewal: "auto",
    proration: "posts",
    credits: "review",
  };
  const [terms, setTerms] = useState<Terms>(initial);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [renewalTerms, setRenewalTerms] = useState<Terms | null>(null);
  const [action, setAction] = useState("new");
  const [stage, setStage] = useState<"idle" | "edit" | "review">("idle");
  const [timing, setTiming] = useState("month");
  const [date, setDate] = useState(today);
  const [scope, setScope] = useState("future");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const latest = revisions.at(-1);
  const active = latest && latest.action !== "end";
  const effective =
    action === "new"
      ? terms.start
      : action === "end" || timing === "date" || terms.kind !== "monthly"
        ? date
        : timing === "next"
          ? nextMonth(today)
          : monthStart(today);
  const monthly = terms.kind === "monthly";
  const effectiveScope = !monthly || action === "end" ? "period" : scope;
  function change(key: keyof Terms, value: string) {
    setTerms((previous) => ({ ...previous, [key]: value }));
    setError("");
  }
  function open(next: string) {
    setAction(next);
    setTerms(next === "new" ? initial : latest!.terms);
    setReason("");
    setError("");
    setTiming("month");
    setScope("future");
    setDate(today);
    setStage("edit");
  }
  function review() {
    if (!terms.brand || !effective) {
      setError("Choose a brand and effective date.");
      return;
    }
    if (
      action !== "end" &&
      (!terms.amount.trim() ||
        !Number.isFinite(Number(terms.amount)) ||
        Number(terms.amount) < 0 ||
        !Number.isInteger(Number(terms.posts)) ||
        Number(terms.posts) < 1)
    ) {
      setError(
        "Enter a retainer of $0 or more and a whole-number post requirement.",
      );
      return;
    }
    if (
      action !== "end" &&
      !monthly &&
      (!terms.end || terms.end < terms.start || terms.end < effective)
    ) {
      setError("Choose an end date on or after the start and effective dates.");
      return;
    }
    if (
      monthly &&
      (!validAgreementDate(terms.firstPeriodEnd) ||
        terms.firstPeriodEnd < terms.start)
    ) {
      setError("Choose a first-period end date on or after the start date.");
      return;
    }
    if (action !== "new" && effective < terms.start) {
      setError(
        "The effective date cannot precede this agreement’s start date.",
      );
      return;
    }
    if (action !== "new" && !reason.trim()) {
      setError("Add a reason so the change has context in the history.");
      return;
    }
    setError("");
    setStage("review");
  }
  const brandName =
    brands.find((brand) => brand.value === terms.brand)?.label ?? "Brand";
  return (
    <section className={styles.root} aria-label="Agreement flow prototype">
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Interactive preview</span>
          <h2>A clear agreement. Every period.</h2>
          <p>
            Try the new flow. Changes stay in this tab and disappear on refresh.
          </p>
        </div>
        {stage === "idle" && !active && (
          <button
            className={styles.primary}
            onClick={() => open("new")}
            disabled={!brands.length}
          >
            <Plus size={16} /> New agreement
          </button>
        )}
      </div>
      {stage === "idle" && !latest && (
        <div className={styles.intro}>
          <Repeat2 size={21} />
          <div>
            <strong>Renew automatically. Keep every month.</strong>
            <p>
              Set the terms once, then revise a specific month or future
              renewals without rewriting earlier agreements.
            </p>
          </div>
        </div>
      )}
      {stage === "idle" && latest && (
        <div className={styles.result} role="status">
          <div>
            <span className={styles.kicker}>
              Local preview ·{" "}
              {latest.action === "end" ? "End scheduled" : "Draft agreement"}
            </span>
            <h3>
              {
                brands.find((brand) => brand.value === latest.terms.brand)
                  ?.label
              }
            </h3>
            <strong>
              {money(latest.terms.amount)}{" "}
              <small>
                for {latest.terms.posts} posts
                {latest.terms.kind === "monthly" ? " / month" : ""}
              </small>
            </strong>
            <p>
              {latest.action === "end" ? "Ends" : "Effective"}{" "}
              {latest.effective} · No live changes saved
            </p>
          </div>
          {active && (
            <div className={styles.actions}>
              <button onClick={() => open("change")}>Change terms</button>
              <button onClick={() => open("end")}>End agreement</button>
            </div>
          )}
        </div>
      )}
      {stage !== "idle" && (
        <div className={styles.editor}>
          <div className={styles.editorHead}>
            <div>
              <span className={styles.kicker}>
                {stage === "edit" ? "1 · Define terms" : "2 · Review impact"}
              </span>
              <h3>
                {action === "new"
                  ? "New agreement"
                  : action === "end"
                    ? "End agreement"
                    : "Change agreement terms"}
              </h3>
            </div>
            <button
              aria-label="Close agreement preview"
              onClick={() => setStage("idle")}
            >
              <X size={18} />
            </button>
          </div>
          {stage === "edit" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                review();
              }}
            >
              <div className={styles.fields}>
                <div className={styles.field}>
                  <span>Brand</span>
                  <ChoiceMenu
                    label="Agreement brand"
                    value={terms.brand}
                    options={brands}
                    disabled={action !== "new"}
                    onChange={(value) => change("brand", value)}
                  />
                </div>
                {action !== "end" && (
                  <>
                    <div className={styles.field}>
                      <span>Agreement type</span>
                      <ChoiceMenu
                        label="Agreement type"
                        value={terms.kind}
                        options={kinds}
                        disabled={action !== "new"}
                        onChange={(value) => change("kind", value)}
                      />
                    </div>
                    <label className={styles.field} htmlFor={`${id}-amount`}>
                      Retainer ($)
                      <input
                        id={`${id}-amount`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={terms.amount}
                        onChange={(event) =>
                          change("amount", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label className={styles.field} htmlFor={`${id}-posts`}>
                      Required posts
                      <input
                        id={`${id}-posts`}
                        type="number"
                        min="1"
                        step="1"
                        value={terms.posts}
                        onChange={(event) =>
                          change("posts", event.target.value)
                        }
                        required
                      />
                    </label>
                    {action === "new" && (
                      <label className={styles.field}>
                        Starts
                        <input
                          type="date"
                          value={terms.start}
                          onChange={(event) =>
                            change("start", event.target.value)
                          }
                          required
                        />
                      </label>
                    )}
                    {monthly && action === "new" && (
                      <label className={styles.field}>
                        First period ends
                        <input
                          type="date"
                          value={terms.firstPeriodEnd}
                          min={terms.start}
                          required
                          onChange={(event) =>
                            change("firstPeriodEnd", event.target.value)
                          }
                        />
                      </label>
                    )}
                    {!monthly && (
                      <label className={styles.field}>
                        {terms.kind === "package"
                          ? "Delivery deadline"
                          : "Ends"}
                        <input
                          type="date"
                          value={terms.end}
                          min={terms.start}
                          onChange={(event) =>
                            change("end", event.target.value)
                          }
                          required
                        />
                      </label>
                    )}
                    {monthly && (
                      <div className={styles.field}>
                        <span>Renewal</span>
                        <ChoiceMenu
                          label="Renewal"
                          value={terms.renewal}
                          options={[
                            { value: "auto", label: "Automatic each month" },
                            {
                              value: "manual",
                              label: "Explicit renewal each month",
                            },
                          ]}
                          onChange={(value) => change("renewal", value)}
                        />
                      </div>
                    )}
                    <div className={styles.field}>
                      <span>Payment basis</span>
                      <ChoiceMenu
                        label="Payment basis"
                        value={terms.proration}
                        options={[
                          {
                            value: "posts",
                            label: "Prorate by qualifying posts",
                          },
                          {
                            value: "full",
                            label: "Full fee, subject to approval",
                          },
                        ]}
                        onChange={(value) => change("proration", value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <span>Prior-period video credits</span>
                      <ChoiceMenu
                        label="Prior-period video credits"
                        value={terms.credits}
                        options={[
                          {
                            value: "review",
                            label: "Allow individually approved credits",
                          },
                          {
                            value: "none",
                            label: "Only videos from this period",
                          },
                        ]}
                        onChange={(value) => change("credits", value)}
                      />
                    </div>
                  </>
                )}
                {action === "change" && monthly && (
                  <div className={styles.field}>
                    <span>When do new terms apply?</span>
                    <ChoiceMenu
                      label="Effective timing"
                      value={timing}
                      options={[
                        { value: "month", label: "Start of this month" },
                        { value: "date", label: "A specific date" },
                        { value: "next", label: "Start of next month" },
                      ]}
                      onChange={setTiming}
                    />
                  </div>
                )}
                {(action === "end" ||
                  (action === "change" && (timing === "date" || !monthly))) && (
                  <label className={styles.field}>
                    {action === "end" ? "Final active date" : "Effective date"}
                    <input
                      type="date"
                      value={date}
                      min={terms.start}
                      onChange={(event) => {
                        setDate(event.target.value);
                        if (!monthly) setTiming("date");
                      }}
                      required
                    />
                  </label>
                )}
                {action === "change" && monthly && (
                  <div className={styles.field}>
                    <span>Apply changed terms to</span>
                    <ChoiceMenu
                      label="Renewal change scope"
                      value={scope}
                      options={[
                        {
                          value: "future",
                          label: "This period + future renewals",
                        },
                        { value: "period", label: "This period only" },
                      ]}
                      onChange={setScope}
                    />
                  </div>
                )}
                {action !== "new" && (
                  <label className={`${styles.field} ${styles.wide}`}>
                    Reason for change
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="For example: revised monthly deliverables agreed with creator"
                      required
                      maxLength={1000}
                    />
                  </label>
                )}
              </div>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <footer className={styles.footer}>
                <span>Preview only · no payment will be approved</span>
                <button className={styles.primary} type="submit">
                  Review impact <ArrowRight size={15} />
                </button>
              </footer>
            </form>
          ) : (
            <>
              <div className={styles.review}>
                <div className={styles.summary}>
                  <span className={styles.kicker}>{brandName}</span>
                  <h3>
                    {action === "end"
                      ? `Ends ${effective}`
                      : `${money(terms.amount)} for ${terms.posts} posts`}
                  </h3>
                  <p>
                    {action === "end"
                      ? "Future renewals stop after the final active date."
                      : `Effective ${effective}${monthly ? " · monthly agreement" : ""}`}
                  </p>
                </div>
                <dl className={styles.impact}>
                  {action === "change" && latest && (
                    <div>
                      <dt>Previous terms</dt>
                      <dd>
                        {money(latest.terms.amount)} for {latest.terms.posts}{" "}
                        posts. The original version remains in the history.
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      {action === "new" && monthly
                        ? "First period"
                        : "Current period"}
                    </dt>
                    <dd>
                      {action === "new" && monthly
                        ? `${terms.start} to ${terms.firstPeriodEnd}: one agreement for ${money(terms.amount)} and ${terms.posts} posts. No extra retainer is created for the opening partial month.`
                        : action === "end"
                          ? "Keep performance and fulfillment; review final payment separately."
                          : action === "change" && timing === "date"
                            ? "Keep both sets of terms with their effective dates. Any split-period payment needs review."
                            : "Use these terms from the selected effective date."}
                    </dd>
                  </div>
                  <div>
                    <dt>Future periods</dt>
                    <dd>
                      {action === "end"
                        ? "No further automatic renewals."
                        : !monthly
                          ? "Ends at the agreed deadline. No monthly renewal."
                          : effectiveScope === "period" && action === "change"
                            ? `Resume ${money(renewalTerms?.amount ?? "0")} for ${renewalTerms?.posts ?? "�"} posts after this period (${renewalTerms?.renewal === "auto" ? "automatic renewal" : "explicit renewal required"}).`
                            : terms.renewal === "auto"
                              ? action === "new"
                                ? `Next period starts ${new Date(new Date(terms.firstPeriodEnd + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)}; subsequent periods end at calendar month-end.`
                                : "Create a separate agreement each month on these terms."
                              : "Wait for explicit renewal before opening another month."}
                    </dd>
                  </div>
                  <div>
                    <dt>Earlier history</dt>
                    <dd>
                      Earlier agreements remain unchanged. Record this revision,
                      its author and reason.
                    </dd>
                  </div>
                  <div>
                    <dt>Sent reports</dt>
                    <dd>
                      Keep the original report. Publish a new revision when a
                      correction is needed.
                    </dd>
                  </div>
                  {action !== "end" && (
                    <>
                      <div>
                        <dt>Payment</dt>
                        <dd>
                          {terms.proration === "posts"
                            ? "Prorate against qualifying posts; approval remains a separate step."
                            : "Full fee requires payment approval."}
                        </dd>
                      </div>
                      <div>
                        <dt>Video credits</dt>
                        <dd>
                          {terms.credits === "review"
                            ? "Select and approve prior-period videos individually. Original posting dates stay intact."
                            : "Count only videos published within this agreement period."}
                        </dd>
                      </div>
                    </>
                  )}
                  {reason && (
                    <div>
                      <dt>Reason</dt>
                      <dd>{reason}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <footer className={styles.footer}>
                <button onClick={() => setStage("edit")}>Back to terms</button>
                <button
                  className={styles.primary}
                  onClick={() => {
                    if (
                      action === "new" ||
                      (action === "change" && effectiveScope === "future")
                    )
                      setRenewalTerms({ ...terms });
                    setRevisions((previous) => [
                      ...previous,
                      {
                        terms: { ...terms },
                        action,
                        effective,
                        scope: effectiveScope,
                        reason,
                      },
                    ]);
                    setStage("idle");
                  }}
                >
                  <Check size={16} /> Apply to preview
                </button>
              </footer>
            </>
          )}
        </div>
      )}
      {revisions.length > 0 && (
        <div className={styles.history}>
          <h3>
            <History size={16} /> Preview activity
          </h3>
          {revisions.map((revision, index) => (
            <div className={styles.event} key={index}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>
                  {revision.action === "new"
                    ? "Agreement drafted"
                    : revision.action === "end"
                      ? "End scheduled"
                      : "Terms revised"}{" "}
                  · {revision.effective}
                </strong>
                <p>
                  {money(revision.terms.amount)} · {revision.terms.posts} posts
                  {revision.reason ? ` · ${revision.reason}` : ""}
                </p>
              </div>
              <small>Local only</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
