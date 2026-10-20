import { LoadingStatus } from '@/components/ui/loading-status';

export default function Loading() {
  return <div className="space-y-4" aria-busy="true">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[26px] font-semibold tracking-tight">Roster</h1><LoadingStatus label="Loading creator performance"/></div>
    <div aria-hidden="true" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-5">{Array.from({length:5},(_,i)=><div key={i} className="space-y-3 border-r border-border p-3"><div className="h-2 w-20 rounded bg-muted"/><div className="h-6 w-24 rounded bg-primary/10 motion-safe:animate-pulse"/></div>)}</div>
    <div aria-hidden="true" className="rounded-xl border border-border bg-card"><div className="h-12 border-b border-border bg-secondary/50"/>{Array.from({length:6},(_,i)=><div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-4 last:border-0 motion-safe:animate-pulse"><div className="h-10 w-10 rounded-full bg-primary/10"/><div className="h-3 w-28 rounded bg-muted"/><div className="ml-auto h-3 w-16 rounded bg-muted"/></div>)}</div>
  </div>;
}
