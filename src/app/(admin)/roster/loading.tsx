import { LoadingStatus } from '@/components/ui/loading-status';

export default function Loading() {
  return <div className="space-y-5" aria-busy="true">
    <div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Creators</p><h1 className="text-3xl font-semibold tracking-tight">Roster</h1><div className="mt-3"><LoadingStatus label="Loading creator performance"/></div></div>
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({length:5},(_,i)=><div key={i} className="space-y-3 rounded-xl border border-border p-4"><div className="h-2 w-20 rounded bg-muted"/><div className="h-6 w-24 rounded bg-primary/10 motion-safe:animate-pulse"/></div>)}</div>
    <div aria-hidden="true" className="rounded-xl border border-border bg-card"><div className="h-12 border-b border-border bg-secondary/50"/>{Array.from({length:6},(_,i)=><div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-4 last:border-0 motion-safe:animate-pulse"><div className="h-10 w-10 rounded-full bg-primary/10"/><div className="h-3 w-28 rounded bg-muted"/><div className="ml-auto h-3 w-16 rounded bg-muted"/></div>)}</div>
  </div>;
}
