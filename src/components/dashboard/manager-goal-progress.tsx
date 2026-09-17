"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { GoalReview } from "@/lib/data/manager-goals-model";
import { formatCurrency } from "@/lib/utils/format";
const Context = createContext<{ data: GoalReview | null; failed: boolean }>({
  data: null,
  failed: false,
});
export function ManagerGoalsProvider({
  month,
  children,
}: {
  month: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    data: GoalReview | null;
    failed: boolean;
    month: string;
  }>({ data: null, failed: false, month });
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/manager-goals?month=${month}&summary=1`, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (!abort.signal.aborted) setState({ data, failed: false, month });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setState({ data: null, failed: true, month });
      });
    return () => abort.abort();
  }, [month]);
  return (
    <Context.Provider
      value={state.month === month ? state : { data: null, failed: false }}
    >
      {children}
    </Context.Provider>
  );
}
export function ManagerGoalProgress({
  managerId,
  month,
}: {
  managerId: string;
  month: string;
}) {
  const { data, failed } = useContext(Context);
  const rows =
    data?.month === month
      ? data.brands.filter((b) => b.managerId === managerId)
      : [];
  const approved = rows.filter((b) => b.goal?.approved_target != null);
  const target = approved.reduce(
    (s, b) => s + Number(b.goal!.approved_target),
    0,
  );
  const complete =
    !!rows.length &&
    approved.length === rows.length &&
    rows.every((b) => b.actual !== null && b.complete);
  const actual = rows.reduce((s, b) => s + (b.actual ?? 0), 0);
  const percent = complete && target ? (actual / target) * 100 : null;
  return (
    <div className="min-w-0 text-xs">
      <span className="block text-muted-foreground">{month} goal</span>
      <strong className="block text-sm">
        {failed
          ? "Unavailable"
          : !data
            ? "Loading goals…"
            : target
              ? `${formatCurrency(target)} target`
              : "Not set"}
      </strong>
      {percent !== null ? (
        <>
          <span>{percent.toFixed(0)}% achieved</span>
          <div className="mt-1 h-1 rounded-full bg-muted">
            <div
              className="h-1 rounded-full bg-primary"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </>
      ) : target > 0 ? (
        <span className="text-muted-foreground">
          {approved.length < rows.length
            ? `${approved.length}/${rows.length} brands approved`
            : "Check data coverage"}
        </span>
      ) : null}
    </div>
  );
}
