'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import portal from './portal-workspace.module.css';

/** The server supplies complete URLs, preserving the current search/period. */
export function PortalMobileSort({ options, active, direction }: {
  options: { value: string; label: string; asc: string; desc: string }[];
  active: string;
  direction: 'asc' | 'desc';
}) {
  const router = useRouter();
  const selected = options.find((option) => option.value === active) ?? options[0];
  if (!selected) return null;
  return (
    <div className={portal.mobileSort}>
      <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">Sort by
        <select aria-label="Sort records by" value={active} className={portal.phoneSelect}
          onChange={(event) => { const option = options.find((item) => item.value === event.target.value); if (option) router.push(option[direction]); }}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <Link href={selected[direction === 'asc' ? 'desc' : 'asc']} className={portal.sortDirection}
        aria-label={`Sort ${direction === 'asc' ? 'descending' : 'ascending'}`}>
        {direction === 'asc' ? <ArrowUpNarrowWide size={17} /> : <ArrowDownWideNarrow size={17} />}
        <span>{direction === 'asc' ? 'Ascending' : 'Descending'}</span>
      </Link>
    </div>
  );
}
