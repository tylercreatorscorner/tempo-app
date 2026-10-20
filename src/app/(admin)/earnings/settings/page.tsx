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
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Finance"
        title="Finance setup"
        subtitle="Billing identities and brand compensation arrangements."
      />
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.5fr)]">
        <div className="min-w-0"><TeamMembersSection /></div>
        <div className="min-w-0"><CompensationArrangementsSection brands={data ?? []} /></div>
      </div>
    </div>
  );
}
