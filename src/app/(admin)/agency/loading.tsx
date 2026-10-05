export default function AgencyLoading() {
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 p-5 sm:p-7" role="status" aria-label="Loading agency workspace"><div className="h-7 w-52 animate-pulse rounded-lg bg-muted" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map(id => <div key={id} className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />)}</div><div className="h-64 animate-pulse rounded-xl border border-border bg-muted/30" /><span className="sr-only">Loading agency workspace</span></div>;
}
