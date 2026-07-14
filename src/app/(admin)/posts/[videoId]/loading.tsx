import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-40 bg-muted rounded animate-pulse" />
          <div className="h-6 w-3/4 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-12 bg-muted rounded animate-pulse" />
              <div className="h-6 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading post…
      </div>
    </div>
  );
}
