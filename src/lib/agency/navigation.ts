/** Keep Agency navigation on the period the user is reviewing. */
export function isAgencyMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
}

export function agencyHref(href: string, month: string | null | undefined): string {
  if (!isAgencyMonth(month)) return href;
  const url = new URL(href, 'https://tempo.invalid');
  url.searchParams.set('month', month);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Lifecycle comparisons use completed calendar months, never an unfinished cohort. */
export function completedAgencyMonth(requested: string | undefined, current: string): string {
  if (isAgencyMonth(requested) && requested < current) return requested;
  const date = new Date(`${current}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
