import { redirect } from "next/navigation";
import { getWorkspaceScope } from "@/lib/auth/workspace-scope";
import { can } from "@/lib/auth/permissions";
import { ManagerReviews } from "@/components/dashboard/manager-reviews";
export default async function Page() {
  const scope = await getWorkspaceScope();
  if (!scope) redirect("/login");
  if (!can(scope, "reporting", "read")) redirect("/dashboard");
  return <ManagerReviews />;
}
