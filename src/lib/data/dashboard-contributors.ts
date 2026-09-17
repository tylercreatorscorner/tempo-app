export interface Contributor { key: string; id?: string; name: string; handle: string; current: number; previous: number; delta: number; }
/** Merge handles before ranking; include creators who fell to zero. Inputs are already scoped. */
export function buildContributors(current: { handle: string; gmv: number }[], previous: { handle: string; gmv: number }[], metadata: Map<string, { id: string; name: string }>) {
  const people = new Map<string, Contributor>();
  for (const [rows, period] of [[current, 'current'], [previous, 'previous']] as const) {
    for (const row of rows) {
      const handle = row.handle.replace(/^@/, '').toLowerCase();
      const meta = metadata.get(handle);
      const key = meta?.id ?? handle;
      const person = people.get(key) ?? { key, id: meta?.id, name: meta?.name ?? `@${handle}`, handle, current: 0, previous: 0, delta: 0 };
      if (Number.isFinite(row.gmv)) person[period] += row.gmv;
      people.set(key, person);
    }
  }
  return [...people.values()].map(person => ({ ...person, delta: person.current - person.previous }))
    .filter(person => Math.abs(person.delta) >= 1).sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
}
