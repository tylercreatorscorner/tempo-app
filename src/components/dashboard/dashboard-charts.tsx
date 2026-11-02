'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import type { ApexOptions } from 'apexcharts';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { ChartLoading, LoadingStatus } from '@/components/ui/loading-status';
import { monthlyPoints, seriesPoints, type MetricKey, type MetricRow } from '@/lib/data/dashboard-series-model';
import { formatCurrency } from '@/lib/utils/format';
import { fmtCompact, fmtCompactCurrency } from '@/components/charts/format';
import styles from './dashboard-charts.module.css';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false, loading: () => <ChartLoading label="Preparing chart" /> });
type Point = { date: string; gmv: number | null; recordedBrands?: number };
type ChartMetric = 'comparison' | MetricKey;
interface DashboardChartProps { start: string; end: string; brand: string | null; initial: Point[]; variant?: 'daily' | 'monthly' }
interface SeriesResult { rows: MetricRow[]; brands: number }
interface LoadedSeries { scope: string; historyStart: string; data: SeriesResult }
interface SeriesContextValue {
  result: SeriesResult | null; pending: boolean; error: boolean; retry: () => void;
  months: string; setMonths: (value: string) => void; historyStart: string;
}
const SeriesContext = createContext<SeriesContextValue | null>(null);
const metricOptions = [
  { value: 'comparison', label: 'GMV comparison' }, { value: 'gmv', label: 'Total GMV' },
  { value: 'managed_gmv', label: 'Managed GMV' }, { value: 'orders', label: 'Total orders' },
  { value: 'managed_orders', label: 'Managed creator orders' }, { value: 'units', label: 'Units sold' },
  { value: 'managed_units', label: 'Managed creator units' },
];

/** One scoped request feeds both chart placements. No cross-user client cache. */
export function DashboardSeriesProvider({ children, start, end, brand }: {
  children: ReactNode; start: string; end: string; brand: string | null; initial?: Point[];
}) {
  const [months, setMonths] = useState('6');
  const [loaded, setLoaded] = useState<LoadedSeries | null>(null);
  const [request, setRequest] = useState({ key: '', pending: true, error: false });
  const [attempt, setAttempt] = useState(0);
  const [year, month] = end.split('-').map(Number);
  const historyStart = new Date(Date.UTC(year, month - Number(months), 1)).toISOString().slice(0, 10);
  const fetchStart = start < historyStart ? start : historyStart;
  // Filter the retained result during render, before effect cleanup. A caller
  // without a React key must never paint another brand or date range's data.
  const scope = JSON.stringify([brand, start, end]);
  const requestKey = JSON.stringify([scope, fetchStart, historyStart, attempt]);
  const current = loaded?.scope === scope ? loaded : null;
  const result = current?.data ?? null;
  const pending = request.key !== requestKey || request.pending;
  const error = request.key === requestKey && request.error;
  useEffect(() => {
    const abort = new AbortController();
    setRequest({ key: requestKey, pending: true, error: false });
    const timeout = setTimeout(() => {
      abort.abort();
      setRequest({ key: requestKey, pending: false, error: true });
    }, 35000);
    const params = new URLSearchParams({ start: fetchStart, end });
    if (brand) params.set('brand', brand);
    fetch(`/api/dashboard/series?${params}`, { signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Chart metrics unavailable');
        const data: SeriesResult = await response.json();
        if (!Array.isArray(data.rows) || !Number.isFinite(data.brands)) throw new Error('Invalid chart metrics');
        return data;
      })
      .then(data => {
        if (!abort.signal.aborted) {
          setLoaded({ scope, historyStart, data });
          setRequest({ key: requestKey, pending: false, error: false });
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setRequest({ key: requestKey, pending: false, error: true });
      })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [fetchStart, end, brand, scope, historyStart, requestKey]);
  return <SeriesContext.Provider value={{ result, pending, error, months, setMonths, historyStart: current?.historyStart ?? historyStart, retry: () => setAttempt(value => value + 1) }}>{children}</SeriesContext.Provider>;
}

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : day;
function baseOptions(dark: boolean): ApexOptions {
  return {
    chart: { type: 'line', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, background: 'transparent', fontFamily: 'inherit', foreColor: dark ? '#aaa9ae' : '#66666c', parentHeightOffset: 0 },
    colors: dark ? ['#ededeb', '#b89bf8', '#8bd4b1'] : ['#191a1c', '#6e4bcc', '#217457'],
    stroke: { width: [2.2, 2.2, 2], curve: 'straight', dashArray: [0, 0, 5] },
    markers: { size: 0, hover: { sizeOffset: 4 } },
    grid: { borderColor: dark ? '#37363d' : '#dddcd7', strokeDashArray: 0, padding: { left: 4, right: 8, top: 0, bottom: 0 } },
    legend: { show: false }, dataLabels: { enabled: false },
    tooltip: { shared: true, intersect: false, theme: dark ? 'dark' : 'light' },
    noData: { text: 'No recorded data in this period', style: { fontSize: '13px', color: dark ? '#aaa9ae' : '#66666c' } },
  };
}
function RetryMessage({ retry, children }: { retry: () => void; children: ReactNode }) {
  return <div className={styles.error} role="alert"><span>{children}</span><button type="button" onClick={retry}>Retry</button></div>;
}

function DailyChart({ start, end, initial }: DashboardChartProps) {
  const dark = useTheme().resolvedTheme === 'dark';
  const { result, pending, error, retry } = useContext(SeriesContext)!;
  const [metric, setMetric] = useState<ChartMetric>('comparison');
  const comparison = metric === 'comparison';
  const numeric = !comparison && !metric.includes('gmv');
  const selected = metricOptions.find(option => option.value === metric)!;
  const points = useMemo(() => result ? seriesPoints(result.rows, start, end, comparison ? 'gmv' : metric) : comparison || metric === 'gmv' ? initial : [], [result, start, end, comparison, metric, initial]);
  const managed = useMemo(() => result && comparison ? seriesPoints(result.rows, start, end, 'managed_gmv') : [], [result, start, end, comparison]);
  const hasInitial = points.some(point => point.gmv !== null);
  const series = comparison
    ? [{ name: 'Total GMV', data: points.map(point => point.gmv) }, ...(result ? [{ name: 'Managed GMV', data: managed.map(point => point.gmv) }] : [])]
    : [{ name: selected.label, data: points.map(point => point.gmv) }];
  const options: ApexOptions = {
    ...baseOptions(dark),
    colors: comparison ? (dark ? ['#ededeb', '#b89bf8'] : ['#191a1c', '#6e4bcc']) : [metric.startsWith('managed_') ? (dark ? '#b89bf8' : '#6e4bcc') : (dark ? '#ededeb' : '#191a1c')],
    xaxis: { categories: points.map(point => point.date), tickAmount: Math.min(5, Math.max(1, points.length - 1)), labels: { formatter: value => dayLabel(String(value)), rotate: 0, hideOverlappingLabels: true, style: { fontSize: '12px' } }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { min: 0, tickAmount: 3, labels: { minWidth: 42, formatter: numeric ? fmtCompact : fmtCompactCurrency, style: { fontSize: '12px' } } },
    tooltip: { shared: true, intersect: false, theme: dark ? 'dark' : 'light', x: { formatter: (_, context) => dayLabel(points[context?.dataPointIndex ?? 0]?.date ?? start) }, y: { formatter: value => value == null ? 'No recorded data' : numeric ? value.toLocaleString('en-US') : formatCurrency(value) } },
  };
  return <section className={`${styles.card} ${styles.daily}`} aria-label="Performance over time">
    <header className={styles.header}><h2>Performance over time</h2><ChoiceMenu compact label="Chart metric" value={metric} onChange={value => setMetric(value as ChartMetric)} options={metricOptions} triggerClassName={styles.control} /></header>
    <div className={styles.legend} aria-hidden="true"><span><i className={styles.totalLine} />{comparison ? 'Total GMV' : selected.label}</span>{comparison && <span><i className={styles.managedLine} />Managed GMV{!result ? (error ? ' unavailable' : ' loading') : ''}</span>}</div>
    {pending && !hasInitial ? <div className={styles.loading}><ChartLoading label="Loading daily performance" /></div> : error && !hasInitial ? <RetryMessage retry={retry}>Daily metrics could not be loaded.</RetryMessage> : !hasInitial ? <p className={styles.empty}>No recorded daily data for these brands and dates. Missing records are not zero sales.</p> : <div className={styles.plot}><ApexChart type="line" height={204} options={options} series={series} /></div>}
    <div className={styles.caption}><span>{numeric ? 'Daily sales activity' : 'Daily sales'} · Selected period{comparison ? ' · Same dollar axis' : ''}</span><InfoTooltip label="Recorded daily totals for the selected brands and dates. A missing import is a gap, not zero sales. Managed metrics use the dashboard’s managed creator membership." /></div>
    {pending && hasInitial && <LoadingStatus label={result ? 'Updating monthly history' : 'Loading managed metrics'} detail={result ? 'Your selected-period chart remains visible while the history refreshes.' : undefined} className={styles.inlineStatus} />}
    {error && hasInitial && <RetryMessage retry={retry}>{result ? 'The history update failed. Your last loaded chart remains visible.' : 'Additional metrics are unavailable. Recorded total GMV remains visible.'}</RetryMessage>}
    <details className={styles.values}><summary>Daily values</summary><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Daily chart values"><table><caption className="sr-only">Daily sales in the selected period. Unavailable values are missing, not zero.</caption><thead><tr><th scope="col">Date</th><th scope="col">{comparison ? 'Total GMV' : selected.label}</th>{comparison && <th scope="col">Managed GMV</th>}</tr></thead><tbody>{points.map((point, index) => <tr key={point.date}><th scope="row">{dayLabel(point.date)}</th><td>{point.gmv === null ? 'Unavailable' : numeric ? point.gmv.toLocaleString('en-US') : formatCurrency(point.gmv)}</td>{comparison && <td>{managed[index]?.gmv == null ? 'Unavailable' : formatCurrency(managed[index].gmv)}</td>}</tr>)}</tbody></table></div></details>
  </section>;
}

function MonthlyChart({ end }: DashboardChartProps) {
  const dark = useTheme().resolvedTheme === 'dark';
  const { result, pending, error, retry, months, setMonths, historyStart } = useContext(SeriesContext)!;
  const points = useMemo(() => result ? monthlyPoints(result.rows, historyStart, end, result.brands) : [], [result, historyStart, end]);
  const options: ApexOptions = {
    ...baseOptions(dark),
    xaxis: { categories: points.map(point => monthLabel(point.month) + (point.partial ? ' *' : '')), axisBorder: { show: false }, axisTicks: { show: false }, labels: { rotate: 0, style: { fontSize: '12px' }, hideOverlappingLabels: true }, tooltip: { enabled: false } },
    yaxis: [{ seriesName: ['Total GMV', 'Managed GMV'], min: 0, tickAmount: 3, labels: { formatter: fmtCompactCurrency, style: { fontSize: '12px' } } }, { seriesName: 'Managed share', opposite: true, min: 0, max: Math.max(100, ...points.map(point => point.share ?? 0)), tickAmount: 4, labels: { formatter: value => `${Math.round(value)}%`, style: { fontSize: '12px' } } }],
    tooltip: { shared: true, intersect: false, theme: dark ? 'dark' : 'light', y: { formatter: (value, context) => value == null ? 'No recorded data' : context?.seriesIndex === 2 ? `${value.toFixed(1)}%` : formatCurrency(value) } },
  };
  return <section className={`${styles.card} ${styles.monthly}`} aria-label="Month-over-month performance">
    <header className={styles.header}><h2>Month over month</h2><ChoiceMenu compact label="History length" value={months} onChange={setMonths} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} triggerClassName={styles.control} /></header>
    <div className={styles.legend} aria-hidden="true"><span><i className={styles.totalLine} />Total GMV</span><span><i className={styles.managedLine} />Managed GMV (left)</span><span><i className={styles.shareLine} />Managed share (right)</span></div>
    {error && !result ? <RetryMessage retry={retry}>Monthly performance could not be loaded.</RetryMessage> : !result ? <div className={styles.loading}><ChartLoading /></div> : !points.some(point => point.total !== null) ? <p className={styles.empty}>No recorded monthly data for these brands. Missing records are not zero sales.</p> : <div className={styles.plot}><ApexChart type="line" height={224} options={options} series={[{ name: 'Total GMV', data: points.map(point => point.total) }, { name: 'Managed GMV', data: points.map(point => point.managed) }, { name: 'Managed share', data: points.map(point => point.share) }]} /></div>}
    {pending && result && <LoadingStatus label="Updating monthly history" detail={`Showing the previous history from ${monthLabel(historyStart.slice(0, 7))} until the new data is ready.`} className={styles.inlineStatus} />}
    {error && result && <RetryMessage retry={retry}>The history update failed. Showing the last successfully loaded history.</RetryMessage>}
    <div className={styles.caption}><span>{monthLabel(historyStart.slice(0, 7))}–{monthLabel(end.slice(0, 7))} · * Partial month or incomplete coverage · Through {end}</span><InfoTooltip label="GMV uses the left dollar axis. Managed share uses the right percentage axis and equals managed GMV divided by total GMV for each month. Missing daily records mark the month partial." /></div>
    {result && <details className={styles.values}><summary>Monthly values</summary><div className={styles.tableScroll} role="region" aria-label="Monthly performance values" tabIndex={0}><table><caption className="sr-only">Monthly total GMV, managed GMV and managed share. An asterisk marks a partial month or missing coverage.</caption><thead><tr><th scope="col">Month</th><th scope="col">Total GMV</th><th scope="col">Managed GMV</th><th scope="col">Share</th></tr></thead><tbody>{points.map(point => <tr key={point.month}><th scope="row">{monthLabel(point.month)}{point.partial ? ' *' : ''}</th><td>{point.total == null ? 'Unavailable' : formatCurrency(point.total)}</td><td>{point.managed == null ? 'Unavailable' : formatCurrency(point.managed)}</td><td>{point.share == null ? 'Unavailable' : `${point.share.toFixed(1)}%`}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

export function DashboardCharts(props: DashboardChartProps) {
  const context = useContext(SeriesContext);
  const chart = props.variant === 'monthly' ? <MonthlyChart {...props} /> : <DailyChart {...props} />;
  return context ? chart : <DashboardSeriesProvider start={props.start} end={props.end} brand={props.brand}>{chart}</DashboardSeriesProvider>;
}
