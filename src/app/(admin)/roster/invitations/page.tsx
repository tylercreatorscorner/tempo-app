import { redirect } from "next/navigation";
import { requireScreen } from "@/lib/auth/require-screen";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { CreatorInvitesSection } from "@/components/settings/creator-invites-section";
import { NavigationLink } from "@/components/ui/navigation-link";
export default async function Page({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const scope = await requireScreen("roster");
  if (scope.impersonating || !["owner", "admin"].includes(scope.role))
    redirect("/roster");
  const db = await createAdminClient();
  const { data, error } = await db
    .from("brands_v2")
    .select("slug,name,display_name")
    .eq("tenant_id", scope.tenantId)
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error("Could not load brands.");
  const requestedBrand = (await searchParams).brand;
  const selectedBrand = data?.find(brand => brand.slug === requestedBrand)?.slug;
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Onboarding"
        subtitle="Bring creators into the right brand, then manage them from the roster."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">01 · Invite</p>
          <h2 className="mt-1 text-sm font-semibold">Send a direct roster link</h2>
          <p className="mt-1 text-sm text-muted-foreground">For creators already approved. This link skips application review.</p>
        </section>
        <section className="rounded-xl border border-border bg-muted/25 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">02 · Manage</p>
          <h2 className="mt-1 text-sm font-semibold">Continue in Creators</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review the creator’s record and brand assignment after they join.</p>
          <NavigationLink href="/roster" className="mt-2">Open creator roster</NavigationLink>
        </section>
      </div>
      <CreatorInvitesSection key={selectedBrand} tenantId={scope.tenantId} initialBrand={selectedBrand} brands={data ?? []} />
    </div>
  );
}
