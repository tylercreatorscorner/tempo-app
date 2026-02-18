import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfQuarter } from 'date-fns';
import type { DateRange, DateRangePreset } from '@/types';

/** Format a number as USD currency: $XX,XXX */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a number with commas: 1,234,567 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/** Format a percentage: 12.5% */
export function formatPercent(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** Format a date for display */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

/** Format a date as YYYY-MM-DD for API calls */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Get a date range from a preset */
export function getDateRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: now, end: now, label: 'Today' };
    case 'yesterday':
      return { start: subDays(now, 1), end: subDays(now, 1), label: 'Yesterday' };
    case 'last7':
      return { start: subDays(now, 7), end: now, label: 'Last 7 days' };
    case 'last14':
      return { start: subDays(now, 14), end: now, label: 'Last 14 days' };
    case 'last30':
      return { start: subDays(now, 30), end: now, label: 'Last 30 days' };
    case 'thisMonth':
      return { start: startOfMonth(now), end: now, label: 'This month' };
    case 'lastMonth': {
      const lastM = subMonths(now, 1);
      return { start: startOfMonth(lastM), end: endOfMonth(lastM), label: 'Last month' };
    }
    case 'thisQuarter':
      return { start: startOfQuarter(now), end: now, label: 'This quarter' };
    default:
      return { start: subDays(now, 7), end: now, label: 'Last 7 days' };
  }
}
