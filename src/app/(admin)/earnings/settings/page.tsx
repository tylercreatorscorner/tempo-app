import { redirect } from "next/navigation";
import { requireScreen } from "@/lib/auth/require-screen";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { TeamMembersSection } from "@/components/settings/team-members-section";
import { CompensationArrangementsSection } from "@/components/settings/compensation-arrangements-section";
export default async function Page() {
  const scope = await requireScreen("earnings");
  if (scope.impersonating || !["owner", "admin"].includes(scope.role))
    redirect("/earnings");
  const db = await createAdminClient();
  const { data, error } = await db
    .from("brands_v2")
    .select("slug,name,display_name")
    .eq("tenant_id", scope.tenantId)
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error("Could not load brands.");
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Finance setup"
        subtitle="Billing identities and brand compensation arrangements."
      />
      <TeamMembersSection />
      <CompensationArrangementsSection brands={data ?? []} />
    </div>
  );
}
