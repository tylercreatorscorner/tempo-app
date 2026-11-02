import { InterfaceIcon } from '@/components/ui/interface-icon';
import Link from "next/link";
import { CreatorPortrait } from "@/components/creators/creator-portrait";
import { BrandIdentity } from "@/components/creators/brand-identity";
import { formatCurrency } from "@/lib/utils/format";
import type { DashboardManager } from "@/lib/data/dashboard-managers";
import type { DashboardSignal } from "@/lib/data/dashboard-signals";
import type { BrandRowData } from "./brand-performance";
import {
  ManagerGoalsProvider,
  ManagerGoalProgress,
} from "./manager-goal-progress";
import styles from "./manager-portfolios.module.css";

function changeLabel(current: number, previous: number) {
  const delta = current - previous;
  const amount = `${delta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(delta))}`;
  return previous > 0
    ? `${amount} · ${((delta / previous) * 100).toFixed(1)}%`
    : `${amount} · from $0`;
}

export function ManagerPortfolios({
  managers,
  brands,
  labels,
  signals,
  start,
  end,
  totalsAvailable,
}: {
  managers: DashboardManager[] | null;
  brands: BrandRowData[];
  labels: Record<string, string>;
  signals: {
    attention: DashboardSignal[];
    opportunities: DashboardSignal[];
    available: boolean;
  };
  start: string;
  end: string;
  totalsAvailable: boolean;
}) {
  const month = end.slice(0, 7);
  return (
    <ManagerGoalsProvider month={month}>
      <section className={styles.section} aria-label="Manager portfolios">
        <header className={styles.header}>
          <div>
            <h2>Manager portfolios</h2>
            <p>Selected-period results · Full calendar-month goals</p>
          </div>
          <Link
            className={styles.internal}
            href={`/dashboard/reviews?month=${month}`}
          >
            Goals & reviews <InterfaceIcon name="external" />
          </Link>
        </header>
        <div className={styles.columns} aria-hidden="true">
          <span>Manager</span>
          <span>Assigned brands</span>
          <span>Managed GMV</span>
          <span>Change</span>
          <span>Monthly goal</span>
          <span>Goal progress</span>
          <span />
        </div>
        {managers === null ? (
          <p className={styles.hint}>
            Manager assignments could not be loaded. Try again shortly.
          </p>
        ) : managers.length === 0 ? (
          <p className={styles.hint}>
            No authorized brand portfolios to display.
          </p>
        ) : (
          managers.map((manager) => {
            const hasManager = manager.id !== "unassigned" && !manager.id.startsWith("unavailable:");
            const rows = brands.filter((row) =>
              manager.brands.includes(row.slug),
            );
            const total = rows.reduce((sum, row) => sum + row.currentGmv, 0);
            const prior = rows.reduce((sum, row) => sum + row.prevGmv, 0);
            const priorManaged = rows.reduce(
              (sum, row) => sum + row.prevManagedGmv,
              0,
            );
            const managed = rows.reduce((sum, row) => sum + row.managedGmv, 0);
            const checks = signals.attention.filter(
              (row) =>
                manager.brands.includes(row.slug) && row.kind === "coverage",
            );
            const attention = signals.attention.filter(
              (row) =>
                manager.brands.includes(row.slug) && row.kind !== "coverage",
            );
            const opportunities = signals.opportunities.filter((row) =>
              manager.brands.includes(row.slug),
            );
            const comparable =
              totalsAvailable && signals.available && checks.length === 0;
            const managedDelta = managed - priorManaged;
            return (
              <details key={manager.id} className={styles.manager}>
                <summary>
                  <div className={styles.identity}>
                    <CreatorPortrait
                      name={manager.name}
                      source={manager.avatar}
                      className={styles.portrait}
                    />
                    <div>
                      <strong>{manager.name}</strong>
                    </div>
                  </div>
                  <div className={styles.assignments}>
                    <span className={styles.mobileLabel}>Assigned brands</span>
                    {rows.length ? rows.map(row => labels[row.slug] ?? row.slug).join(", ") : "No linked brands"}
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.mobileLabel}>Managed GMV</span>
                    <strong>{formatCurrency(managed)}</strong>
                  </div>
                  <div className={`${styles.change} ${comparable ? managedDelta >= 0 ? styles.positive : styles.negative : ""}`}>
                    <span className={styles.mobileLabel}>Change vs prior period</span>
                    {comparable ? changeLabel(managed, priorManaged) : "Comparison unavailable"}
                  </div>
                  <ManagerGoalProgress managerId={manager.id} month={month} presentation="portfolio" />
                  <span className={styles.chevron} aria-hidden="true">
                    <InterfaceIcon name="down" />
                  </span>
                </summary>
                <div className={styles.brands}>
                  <div className={styles.portfolioContext}>
                    <span>{start} – {end}</span>
                    <span>Total GMV <strong>{totalsAvailable ? formatCurrency(total) : "Unavailable"}</strong></span>
                    <span>{comparable ? changeLabel(total, prior) : "Total comparison unavailable"}</span>
                    <span>Managed share <strong>{totalsAvailable && total > 0 ? `${((managed / total) * 100).toFixed(1)}%` : "Unavailable"}</strong></span>
                  </div>
                  <Link
                    className={styles.reviewLink}
                    href={`/dashboard/reviews?month=${month}&manager=${hasManager ? encodeURIComponent(manager.id) : "all"}`}
                  >
                    {hasManager ? `Review ${manager.name}’s goals and results` : "Review brand assignments and goals"} <InterfaceIcon name="forward"/>
                  </Link>
                  {rows.map((row) => {
                    const signal = [
                      ...checks,
                      ...attention,
                      ...opportunities,
                    ].find((signal) => signal.slug === row.slug);
                    return (
                      <Link
                        key={row.slug}
                        href={`/dashboard?${new URLSearchParams({ brand: row.slug, range: "custom", start, end })}`}
                      >
                        <BrandIdentity
                          brand={row.slug}
                          label={labels[row.slug] ?? row.slug}
                        />
                        <span className={styles.brandSignal}>
                          {!signals.available
                            ? "Signals unavailable"
                            : signal?.kind === "coverage"
                              ? "Check data coverage"
                              : signal?.kind === "decline"
                                ? "GMV declining"
                                : signal
                                  ? "GMV growing"
                                  : "No movement signal"}
                        </span>
                        <strong>
                          {totalsAvailable
                            ? formatCurrency(row.currentGmv)
                            : "—"}
                        </strong>
                        <span aria-hidden="true"><InterfaceIcon name="external" /></span>
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })
        )}
        <p className={styles.footnote}>Current assignments · Results {start} – {end}. Expand a manager for brand details and reviews.</p>
      </section>
    </ManagerGoalsProvider>
  );
}
