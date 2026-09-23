/** Brand-local membership labels, separate from staff permissions and product tags. */
export function normalizeCreatorTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return tag.length > 0 && tag.length <= 40 && !/[\u0000-\u001f\u007f,]/.test(tag) ? tag : null;
}
export function matchesCreatorTags(existing: string[] | null | undefined, selected: string[], mode: 'any' | 'all'): boolean {
  if (!selected.length) return true;
  const values = new Set((existing ?? []).map(normalizeCreatorTag).filter(Boolean));
  return mode === 'all' ? selected.every(t => values.has(t)) : selected.some(t => values.has(t));
}
