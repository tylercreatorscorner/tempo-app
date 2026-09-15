'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { CreatorMetricReadout } from './metric-readout';
import { nearestPeriod, normalizePoints, total, type PerformancePoint } from './model';
import styles from './performance.module.css';

interface Props {
  /** Already authorized, chronologically ordered periods; include null buckets for missing data. */
  points: readonly PerformancePoint[];
  scopeLabel: string;
  currency?: string;
  title?: string;
  gmvLabel?: string;
  postsLabel?: string;
  sourceNote?: string;
  /** Explicit subtotal for known periods; missing buckets remain chart gaps. */
  availablePeriodsOnly?: boolean;
}

export function CreatorPerformanceTimeline({ points, scopeLabel, currency = 'USD', title = 'Performance history', gmvLabel = 'GMV', postsLabel = 'Posts published', sourceNote, availablePeriodsOnly = false }: Props) {
  const rows = useMemo(() => normalizePoints(points), [points]);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const [announcement, setAnnouncement] = useState('');
  const host = useRef<SVGSVGElement>(null);
  const gradient = useId();
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows.length]);
  const index = rows.findIndex(row => row.key === (hover ?? pinned));
  const point = rows[index];
  const money = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  const count = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US');
  const selectedScope = point ? `${point.label} · Period detail` : `${scopeLabel} · ${availablePeriodsOnly ? 'Available months only' : 'Period totals'}`;
  const sum = (metric: 'gmv' | 'posts') => total(availablePeriodsOnly ? rows.filter(row => row[metric] !== null) : rows, metric);
  const gmv = point ? point.gmv : sum('gmv');
  const posts = point ? point.posts : sum('posts');
  const left = 8, right = Math.max(left + 1, width - 64), step = (right - left) / Math.max(1, rows.length);
  const x = (i: number) => left + step * (i + .5);
  const known = rows.flatMap(row => row.gmv === null ? [] : [row.gmv]);
  const min = Math.min(0, ...known), max = Math.max(1, ...known);
  const range = max - min;
  const y = (value: number) => 150 - (value - min) / range * 132;
  const maxPosts = Math.max(1, ...rows.map(row => row.posts ?? 0));
  const path = rows.map((row, i) => {
    if (row.gmv === null) return '';
    const command = i > 0 && rows[i - 1].gmv !== null ? 'L' : 'M';
    return `${command}${x(i)},${y(row.gmv)}`;
  }).join(' ');
  function choose(key: string | null) {
    setPinned(key); setHover(null);
    const chosen = rows.find(row => row.key === key);
    setAnnouncement(chosen ? `${chosen.label}, ${money(chosen.gmv)} GMV, ${count(chosen.posts)} posts` : `${scopeLabel}, period totals`);
  }
  return <section className={`${styles.theme} ${styles.panel}`} aria-label={title}>
    <h2 className={styles.heading}>{title}</h2>
    <CreatorMetricReadout cells={[{ label: gmvLabel, value: money(gmv) }, { label: postsLabel, value: count(posts) }]} />
    <div className={styles.scope}><span>{selectedScope}</span>{(point || pinned) && <button className={styles.reset} type="button" onClick={() => choose(null)}>Show period totals</button>}</div>
    {rows.length > 0 && <svg ref={host} className={styles.chart} viewBox={`0 0 ${width} 240`} role="img" aria-label={`GMV and published posts for ${scopeLabel}. Use the period selector for exact values.`}
      onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const i = nearestPeriod(event.clientX - bounds.left, left, right, rows.length); setHover(i === null ? null : rows[i].key); }}
      onPointerLeave={() => setHover(null)}
      onClick={event => { const i = nearestPeriod(event.clientX - event.currentTarget.getBoundingClientRect().left, left, right, rows.length); if (i !== null) choose(rows[i].key); }}>
      <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--cp-accent)" stopOpacity=".08" /><stop offset="1" stopColor="var(--cp-accent)" stopOpacity="0" /></linearGradient></defs>
      {[min, min + range / 2, max].map(value => <g key={value}><line className={styles.grid} x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={right + 8} y={y(value) + 4}>{new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}</text></g>)}
      {rows.length > 1 && rows.every(row => row.gmv !== null) && <path d={`${path} L${x(rows.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradient})`} />}
      <path className={styles.line} d={path} />
      {rows.map((row, i) => <g key={row.key}>
        {row.gmv !== null && (rows.length === 1 || rows[i - 1]?.gmv === null || rows[i + 1]?.gmv === null) && <circle cx={x(i)} cy={y(row.gmv)} r={3} fill="var(--cp-accent)" />}
        {row.posts !== null && <rect className={`${styles.bar} ${i === index ? styles.selectedBar : ''}`} x={x(i) - Math.min(4, step * .2)} y={205 - row.posts / maxPosts * 32} width={Math.min(8, step * .4)} height={row.posts / maxPosts * 32} rx={2} />}
      </g>)}
      <text x={right + 8} y={171}>Posts</text><text x={right + 8} y={186}>{maxPosts}</text><text x={right + 8} y={209}>0</text>
      {point && <><line className={styles.guide} x1={x(index)} x2={x(index)} y1={10} y2={211} />{point.gmv !== null && <circle className={styles.dot} cx={x(index)} cy={y(point.gmv)} r={5} />}</>}
      {rows.length > 0 && <><text x={left} y={233}>{rows[0].axisLabel ?? rows[0].label}</text>{rows.length > 1 && <text x={right} y={233} textAnchor="end">{rows[rows.length - 1].axisLabel ?? rows[rows.length - 1].label}</text>}</>}
    </svg>}
    {rows.length === 0 ? <p className={styles.empty}>No performance history is available for this period.</p> : <div className={styles.controls}><span>Inspect period</span><ChoiceMenu label="Inspect period" value={rows.some(row => row.key === pinned) ? pinned! : 'totals'} onChange={value=>choose(value==='totals'?null:value)} options={[{value:'totals',label:'Period totals'},...rows.map(row=>({value:row.key,label:row.axisLabel ?? row.label}))]} /></div>}
    <p className={styles.note}>GMV in {currency}. Gaps indicate unavailable data; published posts do not establish agreement fulfillment or punctuality.</p>
    {sourceNote && <details className={styles.note}><summary className="cursor-pointer">Data coverage & methodology</summary><p>{sourceNote}</p></details>}
    <span className={styles.srOnly} aria-live="polite">{announcement}</span>
  </section>;
}
