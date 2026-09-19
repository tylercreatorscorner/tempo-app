/** Presentation-only punctuation cleanup. Saved snapshots and URLs stay intact. */
export function reportCopy<T>(value:T):T {
  if (typeof value === 'string') return (/^https?:\/\//.test(value) ? value : value.replace(/\s*—\s*/g, ', ')) as T;
  if (value instanceof Date || value == null) return value;
  if (Array.isArray(value)) return value.map(reportCopy) as T;
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,reportCopy(item)])) as T;
  return value;
}
