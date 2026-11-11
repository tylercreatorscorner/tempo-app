import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { CreatorInviteError } from '@/lib/auth/creator-invite-access';
import { getOnboardingSubmissions, type OnboardingSubmissionsResult } from '@/lib/data/onboarding-submissions';
import { NavigationLink } from '@/components/ui/navigation-link';
import layout from '@/components/ui/workspace-layout.module.css';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
});

export async function OnboardingSubmissions({ scope, brandSlug, page = 1 }: { scope: WorkspaceScope; brandSlug?: string; page?: number }) {
  let result: OnboardingSubmissionsResult | null = null;
  let error = '';
  try { result = await getOnboardingSubmissions(scope, brandSlug, page); } catch (cause) {
    error = cause instanceof CreatorInviteError && (cause.status === 401 || cause.status === 403)
      ? 'Pending creator details require full creator access and invitation permissions.'
      : 'Pending creator details are unavailable. Refresh the page to try again.';
  }
  const pageUrl = (target: number) => {
    const params = new URLSearchParams({ page: String(target) });
    if (brandSlug) params.set('brand', brandSlug);
    return `/roster/invitations?${params.toString()}`;
  };

  return (
    <section className={layout.panel} aria-labelledby="onboarding-submissions-heading">
      <div className={`${layout.sectionHeading} flex-wrap`}>
        <h2 id="onboarding-submissions-heading">Pending creator details</h2>
        {result ? <span className="text-xs text-muted-foreground">{result.total} pending</span> : null}
      </div>
      <p>Review claimed details and confirm account ownership before adding a creator to the managed roster.</p>
      {error ? <p role="alert" className="mt-3">{error}</p> : null}
      {result && result.submissions.length === 0 ? (
        <p className="mt-3">No pending creator details{brandSlug ? ' for this brand' : ''}.</p>
      ) : null}
      {result && result.submissions.length > 0 ? (
        <ul className={`${layout.queue} mt-3`}>
          {result.submissions.map(submission => (
            <li key={submission.id} className={layout.queueRow}>
              <div className={layout.queueIdentity}>
                <h3 className="[overflow-wrap:anywhere]">{submission.name || 'Name unavailable'}</h3>
                <p className="[overflow-wrap:anywhere]">{submission.email || 'Email unavailable'}</p>
                <p className="[overflow-wrap:anywhere]">{submission.brandName}</p>
                <p className="mt-1 [overflow-wrap:anywhere]">
                  <span className="font-medium">Claimed handles: </span>
                  {submission.handles.length ? submission.handles.map(handle => `@${handle}`).join(', ') : 'No handles recorded'}
                </p>
              </div>
              <div className="grid gap-1.5">
                <span className="w-fit rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-foreground">Pending review</span>
                <span className="text-xs text-muted-foreground">
                  {submission.appliedAt ? <time dateTime={submission.appliedAt}>Applied {dateFormat.format(new Date(submission.appliedAt))}</time> : 'Applied date unavailable'}
                </span>
              </div>
              <NavigationLink href={submission.reviewUrl} aria-label={`Review details for ${submission.name || 'this creator'}`} className="min-h-11 shrink-0">
                Review details
              </NavigationLink>
            </li>
          ))}
        </ul>
      ) : null}
      {result && result.totalPages > 1 ? (
        <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Pending creator detail pages">
          <p>Showing {(result.page - 1) * result.pageSize + 1}–{(result.page - 1) * result.pageSize + result.submissions.length} of {result.total} pending records.</p>
          <div className="flex flex-wrap items-center gap-4">
            {result.page > 1 ? <NavigationLink direction="back" href={pageUrl(result.page - 1)} aria-label="Previous page of pending creator details" className="min-h-11">Previous</NavigationLink> : null}
            <span className="text-xs text-muted-foreground">Page {result.page} of {result.totalPages}</span>
            {result.hasMore ? <NavigationLink href={pageUrl(result.page + 1)} aria-label="Next page of pending creator details" className="min-h-11">Next</NavigationLink> : null}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
