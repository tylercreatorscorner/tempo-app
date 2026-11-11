import { requireScreen } from "@/lib/auth/require-screen";
import { can } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { CreatorInvitesSection } from "@/components/settings/creator-invites-section";
import { OnboardingSubmissions } from "@/components/settings/onboarding-submissions";
import { NavigationLink } from "@/components/ui/navigation-link";
import layout from '@/components/ui/workspace-layout.module.css';
export default async function Page({ searchParams }: { searchParams: Promise<{ brand?: string; page?: string }> }) {
  const scope = await requireScreen("roster");
  const params = await searchParams;
  const requestedBrand = params.brand;
  const canInvite = !scope.impersonating && ["owner", "admin"].includes(scope.role)
    && scope.brandScope.kind === "all" && can(scope, "roster", "write");
  if (!canInvite) return <div className={layout.page}>
    <PageHeader title="Onboarding" subtitle="Invite creators into the right brand." />
    <section className={layout.panel} aria-labelledby="invite-access-heading">
      <h2 id="invite-access-heading">Invitation management requires workspace access</h2>
      <p className="mt-2">Ask a workspace owner or admin with full creator access to create an invitation link for your brand.</p>
      <NavigationLink href="/roster" className="mt-3">Back to creators</NavigationLink>
    </section>
  </div>;
  const db = await createAdminClient();
  const { data, error } = await db
    .from("brands_v2")
    .select("slug,name,display_name")
    .eq("tenant_id", scope.tenantId)
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error("Could not load brands.");
  const selectedBrand = data?.find(brand => brand.slug === requestedBrand)?.slug;
  return (
    <div className={layout.page}>
      <PageHeader
        title="Onboarding"
        subtitle="Create a brand invitation, collect creator details, and review new submissions."
      />
      <div className={layout.columns}>
      <CreatorInvitesSection key={scope.tenantId} tenantId={scope.tenantId} initialBrand={selectedBrand} brands={data ?? []} />
      <aside className={layout.stack} aria-label="Creator onboarding guide">
        <section className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">01 · Share</p>
          <h2 className="mt-1 text-sm font-semibold">Choose the right brand</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share the generated link with the creators you want to invite. Each link is tied to one brand.</p>
        </section>
        <section className="rounded-xl border border-border bg-muted/25 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">02 · Review</p>
          <h2 className="mt-1 text-sm font-semibold">Confirm their details</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review pending details below and confirm account ownership before adding a creator to the managed roster.</p>
          <p className="mt-2 text-xs text-muted-foreground">This invitation does not grant Discord access or create a Tempo login.</p>
        </section>
      </aside>
      </div>
      <OnboardingSubmissions scope={scope} brandSlug={selectedBrand} page={Number(params.page) || 1} />
    </div>
  );
}
