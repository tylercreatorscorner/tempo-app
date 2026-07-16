import { cn } from '@/lib/utils';

/**
 * Pulse loading placeholder. The codebase already converged on one idiom —
 * a solid `bg-muted` block sized by h-/w- utilities with Tailwind's built-in
 * `animate-pulse` — but it was hand-rolled at ~55 sites and had drifted
 * (bg-muted vs bg-secondary vs hardcoded grays that never flip in dark mode).
 * This is that idiom, once.
 *
 * `motion-reduce:animate-none` lives here rather than in globals.css, whose
 * reduced-motion block only covers ::view-transition-*.
 *
 * NOTE: do not `npx shadcn add skeleton` over this — stock uses `bg-accent`,
 * and --accent here is a bright indigo (#4B45FF), i.e. glowing blocks.
 *
 * A skeleton is ONLY ever a pending state (a Suspense fallback or a real
 * in-flight fetch). It must never stand in for a failed or hung read — that
 * renders as "—" with the error logged. A skeleton over a dead query is an
 * indefinite lie; see the silent-zero rule in CLAUDE/memory.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse motion-reduce:animate-none rounded bg-muted', className)}
      {...props}
    />
  );
}
