import { cn } from '@/lib/utils';

export interface MeterSegment {
  value: number;
  color: string;
  label?: string;
}

/**
 * Linear progress / share meter — the single shared component for Tempo's ~dozen
 * hand-rolled `<div style={{width:%}}>` bars. Single fill, or `segments` for a
 * stacked bar. Fractions are of `max` (defaults to the segment sum).
 */
export function Meter({
  value,
  max,
  segments,
  color = 'var(--primary)',
  height = 8,
  className,
  track = 'var(--secondary)',
}: {
  value?: number;
  max?: number;
  segments?: MeterSegment[];
  color?: string;
  height?: number;
  className?: string;
  track?: string;
}) {
  const total = max ?? (segments ? segments.reduce((s, x) => s + Math.max(0, x.value), 0) : 1);

  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full', className)}
      style={{ height, backgroundColor: track }}
    >
      {segments
        ? segments.map((s, i) => (
            <div
              key={i}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${total > 0 ? (Math.max(0, s.value) / total) * 100 : 0}%`, backgroundColor: s.color }}
              title={s.label}
            />
          ))
        : (
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${total > 0 ? Math.min(100, Math.max(0, ((value ?? 0) / total) * 100)) : 0}%`, backgroundColor: color }}
          />
        )}
    </div>
  );
}
