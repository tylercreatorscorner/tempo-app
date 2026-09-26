import Link from "next/link";
import { redirect } from "next/navigation";
import { requireScreen } from "@/lib/auth/require-screen";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
export const dynamic = "force-dynamic";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireScreen("settings");
  const params = await searchParams;
  if (params.tiktok) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (typeof value === "string") query.set(key, value);
    redirect(`/workflows/integrations?${query.toString()}#tiktok-shop`);
  }
  const admin = ["owner", "admin"].includes(scope.role);
  const db = await createAdminClient();
  const { data: tenant, error } = await db
    .from("tenants")
    .select("name")
    .eq("id", scope.tenantId)
    .single();
  if (error) throw new Error("Could not load workspace settings.");
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="General" subtitle="Your account and workspace." />
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-semibold mb-4">Account</h2>
        <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{scope.name || "Not set"}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{scope.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="capitalize">{scope.role}</dd>
          <dt className="text-muted-foreground">Workspace</dt>
          <dd>{tenant.name}</dd>
        </dl>
        {admin && (
          <Link
            className="inline-block mt-4 text-sm font-medium text-primary"
            href="/team"
          >
            Manage people and access →
          </Link>
        )}
      </section>
      {admin && (
        <section className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
          <h2 className="font-semibold mb-2">Workspace tools</h2>
          <div className="divide-y divide-border text-sm">
            {[
              [
                "/settings/brands",
                "Brands",
                "Manage brand setup and workspace clients.",
              ],
              [
                "/workflows/integrations",
                "Connections",
                "TikTok Shop authorization, Discord and other connected services.",
              ],
              [
                "/roster/invitations",
                "Creator invitations",
                "Create brand-specific join links.",
              ],
              [
                "/earnings/settings",
                "Finance setup",
                "Billing identities, payment details and compensation arrangements.",
              ],
            ].map(([href, title, description]) => (
              <Link
                key={href}
                href={href}
                className="block py-3 hover:text-primary"
              >
                <span className="font-medium">{title} →</span>
                <p className="text-muted-foreground mt-1">{description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
