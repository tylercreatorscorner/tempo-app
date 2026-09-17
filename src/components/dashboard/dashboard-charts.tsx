"use client";
import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { ApexOptions } from "apexcharts";
import { ManagedGmvChart } from "./managed-gmv-chart";
import { ChoiceMenu } from "@/components/ui/choice-menu";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  seriesPoints,
  monthlyPoints,
  type MetricKey,
  type MetricRow,
} from "@/lib/data/dashboard-series-model";
import { formatCurrency } from "@/lib/utils/format";
import { ChartLoading, LoadingStatus } from '@/components/ui/loading-status';
const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false, loading: () => <ChartLoading label="Preparing chart" /> });
const options = [
  { value: "gmv", label: "Total GMV" },
  { value: "managed_gmv", label: "Managed GMV" },
  { value: "orders", label: "Total orders" },
  { value: "managed_orders", label: "Managed creator orders" },
  { value: "units", label: "Units sold" },
  { value: "managed_units", label: "Managed creator units" },
];
export function DashboardCharts({
  start,
  end,
  brand,
  initial,
  share,
}: {
  start: string;
  end: string;
  brand: string | null;
  initial: { date: string; gmv: number | null; recordedBrands?: number }[];
  share: React.ReactNode;
}) {
  const [metric, setMetric] = useState<MetricKey>("gmv");
  const [months, setMonths] = useState("6");
  const [result, setResult] = useState<{
    rows: MetricRow[];
    brands: number;
  } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [year, month] = end.split("-").map(Number);
  const historyStart = new Date(Date.UTC(year, month - Number(months), 1))
    .toISOString()
    .slice(0, 10);
  const fetchStart = start < historyStart ? start : historyStart;
  useEffect(() => {
    const abort = new AbortController();
    setResult(null);
    setError(false);
    // Bound the whole request, including auth/scope work before the database query.
    const timeout = setTimeout(() => {
      abort.abort();
      setError(true);
    }, 35000);
    const params = new URLSearchParams({ start: fetchStart, end });
    if (brand) params.set("brand", brand);
    fetch(`/api/dashboard/series?${params}`, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) throw Error();
        return res.json();
      })
      .then((data) => {
        if (!abort.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [fetchStart, end, brand, retry]);
  const selected = options.find((option) => option.value === metric)!;
  const points = useMemo(() => result
    ? seriesPoints(result.rows, start, end, metric)
    : metric === "gmv"
      ? initial
      : [], [result, start, end, metric, initial]);
  const monthly = useMemo(() => result
    ? monthlyPoints(result.rows, historyStart, end, result.brands)
    : [], [result, historyStart, end]);
  const ink = dark ? "#a9a9b3" : "#64646f";
  const apex: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      background: "transparent",
      fontFamily: "inherit",
      foreColor: ink,
    },
    colors: ["#8556ed", "#20a58e", "#8e92a5"],
    stroke: { width: [3, 3, 2], curve: "straight", dashArray: [0, 0, 5] },
    markers: { size: 3, hover: { sizeOffset: 2 } },
    grid: { borderColor: dark ? "#303036" : "#ececf0", strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px" },
    xaxis: {
      categories: monthly.map(
        (p) =>
          new Date(p.month + "-01T00:00:00Z").toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
          }) + (p.partial ? " *" : ""),
      ),
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: false },
    },
    yaxis: [
      {
        seriesName: ["Total GMV", "Managed GMV"],
        min: 0,
        labels: {
          formatter: (v) =>
            Intl.NumberFormat("en-US", {
              notation: "compact",
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 1,
            }).format(v),
        },
      },
      {
        seriesName: "Managed share",
        opposite: true,
        min: 0,
        max: Math.max(100, ...monthly.map((p) => p.share ?? 0)),
        labels: { formatter: (v) => `${Math.round(v)}%` },
      },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      theme: dark ? "dark" : "light",
      y: {
        formatter: (value, opts) =>
          value == null
            ? "No recorded data"
            : opts?.seriesIndex === 2
              ? `${value.toFixed(1)}%`
              : formatCurrency(value),
      },
    },
    dataLabels: { enabled: false },
  };
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ManagedGmvChart
            key={metric}
            data={points}
            label={selected.label}
            numeric={!metric.includes("gmv")}
            totalBrands={result?.brands}
            coverageUnit="stores"
            controls={
              <div className="flex items-center gap-2">
                <ChoiceMenu
                  compact
                  label="Chart metric"
                  value={metric}
                  onChange={(v) => setMetric(v as MetricKey)}
                  options={options}
                />
                <InfoTooltip label="Recorded daily totals for your selected brands. Missing imports are gaps, not zero sales. Managed metrics use the same creator membership as the dashboard." />
                {!result && !error && (
                  <LoadingStatus label="Loading metrics" />
                )}
              </div>
            }
          />
        </div>
        {share}
      </div>
      <section
        className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5"
        aria-label="Monthly performance"
      >
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Month over month</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              GMV and managed contribution
            </p>
          </div>
          <div className="flex items-center gap-2">
            <InfoTooltip label="Dollar values use the left axis; managed share uses the right axis. An asterisk marks a partial month or missing daily records. Share is managed GMV divided by total GMV, not an average of daily percentages." />
            <ChoiceMenu
              compact
              label="History length"
              value={months}
              onChange={setMonths}
              options={[
                { value: "6", label: "6 months" },
                { value: "12", label: "12 months" },
              ]}
            />
          </div>
        </header>
        {error ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Chart data could not be loaded.{" "}
            <button
              className="text-primary underline"
              onClick={() => setRetry((v) => v + 1)}
            >
              Retry
            </button>
          </div>
        ) : !result ? (
          <ChartLoading key={`${fetchStart}|${end}|${brand}|${retry}`} />
        ) : (
          <>
            <ApexChart
              type="line"
              height={270}
              options={apex}
              series={[
                { name: "Total GMV", data: monthly.map((p) => p.total) },
                { name: "Managed GMV", data: monthly.map((p) => p.managed) },
                { name: "Managed share", data: monthly.map((p) => p.share) },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              * Partial month or incomplete coverage · Through {end}
            </p>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Monthly values</summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-right tabular-nums">
                  <thead>
                    <tr>
                      <th className="text-left">Month</th>
                      <th>Total GMV</th>
                      <th>Managed GMV</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((p) => (
                      <tr key={p.month}>
                        <td className="py-2 text-left">
                          {p.month}
                          {p.partial ? " *" : ""}
                        </td>
                        <td>
                          {p.total === null ? "—" : formatCurrency(p.total)}
                        </td>
                        <td>
                          {p.managed === null ? "—" : formatCurrency(p.managed)}
                        </td>
                        <td>
                          {p.share === null ? "—" : p.share.toFixed(1) + "%"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </>
  );
}
