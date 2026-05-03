import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

interface Props {
  label: string;
  column: string;
  /** Current sort column (from URL params) */
  activeColumn: string;
  /** Current sort direction (from URL params) */
  activeDir: SortDir;
  /** URL builder — given a target {column, dir}, return the href */
  buildHref: (column: string, dir: SortDir) => string;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Server-rendered sortable column header. Click toggles direction if it's
 * already the active column; otherwise switches to this column with `desc`
 * as the default (matches "biggest first" expectation for numeric columns).
 */
export function SortableHeader({
  label,
  column,
  activeColumn,
  activeDir,
  buildHref,
  align = 'left',
  className,
}: Props) {
  const isActive = activeColumn === column;
  const nextDir: SortDir = isActive ? (activeDir === 'desc' ? 'asc' : 'desc') : 'desc';

  return (
    <th className={cn('px-3 py-3', align === 'right' ? 'text-right' : 'text-left', className)}>
      <Link
        href={buildHref(column, nextDir)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
          align === 'right' ? 'flex-row-reverse' : '',
          isActive ? 'text-[#1A1B3A]' : 'text-gray-500 hover:text-gray-700',
        )}
      >
        {label}
        {isActive ? (
          activeDir === 'desc' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </Link>
    </th>
  );
}
