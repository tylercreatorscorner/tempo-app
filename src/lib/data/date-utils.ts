import { subDays, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

export type DatePreset = 'yesterday' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
];

export function resolveDateRange(preset?: string | null): { startDate: string; endDate: string; preset: DatePreset } {
  const p = (preset && DATE_PRESETS.some(d => d.value === preset) ? preset : 'last7') as DatePreset;
  const now = new Date();

  let start: Date;
  let end: Date = now;

  switch (p) {
    case 'yesterday':
      start = subDays(now, 1);
      end = subDays(now, 1);
      break;
    case 'last7':
      start = subDays(now, 7);
      break;
    case 'last14':
      start = subDays(now, 14);
      break;
    case 'last30':
      start = subDays(now, 30);
      break;
    case 'thisMonth':
      start = startOfMonth(now);
      break;
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      start = startOfMonth(lm);
      end = endOfMonth(lm);
      break;
    }
    default:
      start = subDays(now, 7);
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    preset: p,
  };
}
