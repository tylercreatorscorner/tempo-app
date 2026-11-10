/** Unrelated identity edits must never create or overwrite commercial terms. */
export function changedRosterTerms(draft: { retainer: string; monthly_post_requirement: string }, current: { retainer: number | null; monthly_post_requirement: number | null }) {
  const result: { retainer?: number | null; monthly_post_requirement?: number | null } = {};
  for (const key of ['retainer', 'monthly_post_requirement'] as const) {
    const text = draft[key].trim();
    if (text === String(current[key] ?? '')) continue;
    const value = text === '' ? null : Number(text);
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(key === 'retainer' ? 'Enter a valid non-negative retainer, or leave it blank when not recorded.' : 'Enter a valid monthly post requirement, or leave it blank when not recorded.');
    if (key === 'monthly_post_requirement' && value !== null && (!Number.isInteger(value) || value > 200)) throw new Error('Monthly post requirement must be a whole number from 0 to 200.');
    result[key] = value;
  }
  return result;
}
