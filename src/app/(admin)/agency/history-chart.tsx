'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import type { ApexOptions } from 'apexcharts';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import type { summarizeAgencyTrend } from '@/lib/agency/leadership-trends';
import styles from './leadership-trends.module.css';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false, loading: () => <div className={styles.notice} role="status" style={{ height: 225 }}>Preparing trend chart</div> });
type Row = ReturnType<typeof summarizeAgencyTrend>;
const names = { fees: 'Calculated service fees', clients: 'Active clients', retention: 'Client retention' };
type Metric = keyof typeof names;

/** Monthly service metrics only. Nulls stay gaps; no weekly fee proration. */
export function AgencyHistoryChart({ rows }: { rows: Row[] }) {
  const [metric, setMetric] = useState<Metric>('clients');
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const ink = dark ? '#b4b4be' : '#62626d';
  const values = rows.map(row => metric === 'fees' ? row.calculatedCents === null || row.partial ? null : row.calculatedCents / 100
    : metric === 'clients' ? row.retention.opening + row.retention.newClients
    : row.retention.retentionRate === null ? null : row.retention.retentionRate * 100);
  const format = (value: number) => metric === 'fees' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : metric === 'retention' ? `${value.toFixed(1)}%` : String(Math.round(value));
  const options: ApexOptions = {
    chart: { type: 'line', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, fontFamily: 'inherit', foreColor: ink, background: 'transparent' },
    colors: [dark ? '#a493ff' : '#6d54f5'],
    stroke: { width: 2.5, curve: 'straight' },
    markers: { size: 4, strokeWidth: 2, strokeColors: dark ? '#19191d' : '#ffffff', hover: { size: 6 } },
    grid: { borderColor: dark ? '#303036' : '#e6e6eb', strokeDashArray: 3, padding: { left: 8, right: 16 } },
    dataLabels: { enabled: false },
    xaxis: { categories: rows.map(row => new Date(`${row.month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })), axisBorder: { show: false }, axisTicks: { show: false }, crosshairs: { show: false }, tooltip: { enabled: false } },
    yaxis: { min: 0, ...(metric === 'retention' ? { max: 100 } : {}), tickAmount: 4, labels: { formatter: format } },
    tooltip: { theme: dark ? 'dark' : 'light', intersect: false, shared: true, y: { formatter: (value, context) => {
      const row = rows[context?.dataPointIndex ?? 0];
      return `${format(value)}${metric === 'fees' && row?.partial ? ' · partial subtotal' : ''}`;
    } } },
    legend: { show: false },
    noData: { text: 'No complete values for this metric' },
  };
  return <div className={styles.chartPanel}>
    <div className={styles.chartHeader}><div><h3>{names[metric]}</h3><p>Six completed months. Exact figures and coverage are listed below.</p></div><ChoiceMenu compact label="Trend metric" value={metric} options={Object.entries(names).map(([value, label]) => ({ value, label }))} onChange={value => setMetric(value as Metric)} /></div>
    {values.some(value => value !== null) ? <div role="img" aria-label={`${names[metric]} monthly trend. See the tables below for exact values.`}><Chart type="line" height={225} options={options} series={[{ name: names[metric], data: values }]} /></div>
      : <p className={styles.notice}>No fully covered months yet. Select a month in the table below to resolve its missing terms or source data.</p>}
    {metric === 'fees' && <p className={styles.note}>Only months with complete client calculations appear on this chart. Partial subtotals remain in the table below; they are not plotted as comparable agency revenue.</p>}
  </div>;
}
