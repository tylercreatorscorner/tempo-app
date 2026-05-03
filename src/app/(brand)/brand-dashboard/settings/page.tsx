import { Mail, User, Image as ImageIcon, Users as UsersIcon, ExternalLink, Lock } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import { createAdminClient } from '@/lib/supabase/server';
import { EditableName } from './editable-name';

export const dynamic = 'force-dynamic';

interface BrandTeamMember {
  email: string;
  name: string | null;
}

interface AccountManager {
  name: string | null;
  email: string;
}

export default async function BrandSettingsPage() {
  const ctx = await requireBrandPortalContext();
  const accent = ctx.activeBrand.color || '#FF4D8D';

  // Pull supplementary data via admin client (avoids the brand-scoped RLS for these reads)
  const admin = await createAdminClient();

  // Account manager = tenant owner (single contact for now)
  const { data: ownerRows } = await admin
    .from('user_profiles')
    .select('email, name')
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .eq('role', 'owner')
    .limit(1);
  const accountManager: AccountManager | null = ownerRows?.[0]
    ? { name: ownerRows[0].name, email: ownerRows[0].email }
    : null;

  // Other brand-role users with access to the same brand
  const { data: accessRows } = await admin
    .from('user_brand_access')
    .select('user_id')
    .eq('brand_id', ctx.activeBrand.id);
  const brandUserIds = (accessRows ?? []).map((r) => r.user_id);

  let teammates: BrandTeamMember[] = [];
  if (brandUserIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, email, name')
      .in('user_id', brandUserIds)
      .eq('role', 'brand');
    teammates = (profiles ?? [])
      .filter((p) => p.user_id !== ctx.user.id)
      .map((p) => ({ email: p.email, name: p.name }));
  }

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your account, brand, and team — managed by your account manager at the agency.
        </p>
      </div>

      {/* Account manager card */}
      {accountManager && (
        <SectionCard
          icon={Mail}
          title="Account manager"
          description="Reach out anytime — they can update settings, generate custom reports, or talk strategy."
        >
          <div className="px-5 py-4 flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{
                background: `linear-gradient(135deg, ${accent}, #7C5CFC)`,
              }}
            >
              {(accountManager.name ?? accountManager.email)[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A1B3A]">
                {accountManager.name ?? 'Your account manager'}
              </p>
              <p className="text-xs text-gray-500 truncate">{accountManager.email}</p>
            </div>
            <a
              href={`mailto:${accountManager.email}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 hover:border-gray-300 text-xs font-medium text-gray-700 hover:text-[#1A1B3A] transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </a>
          </div>
        </SectionCard>
      )}

      {/* Brand profile */}
      <SectionCard
        icon={ImageIcon}
        title="Brand"
        description="How your brand appears in this portal. Contact your account manager to update."
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-base font-bold overflow-hidden flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {ctx.activeBrand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ctx.activeBrand.logo_url}
                alt={ctx.activeBrand.display_name ?? ctx.activeBrand.name}
                className="h-full w-full object-cover"
              />
            ) : (
              (ctx.activeBrand.display_name ?? ctx.activeBrand.name).slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1A1B3A]">
              {ctx.activeBrand.display_name ?? ctx.activeBrand.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Brand color:{' '}
              <span
                className="inline-block h-2.5 w-2.5 rounded-full align-middle mr-1 ml-0.5"
                style={{ backgroundColor: accent }}
              />
              <span className="font-mono">{accent}</span>
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Profile */}
      <SectionCard
        icon={User}
        title="Your profile"
        description="Update your display name. Email is locked to your sign-in identity."
      >
        <dl className="divide-y divide-gray-50">
          <EditableName initialName={ctx.user.name ?? ''} />
          <div className="flex items-center justify-between px-5 py-3">
            <dt className="text-xs text-gray-500">Email</dt>
            <dd className="flex items-center gap-1.5 text-sm font-medium text-[#1A1B3A]">
              {ctx.user.email}
              <Lock className="h-3 w-3 text-gray-300" aria-label="Locked" />
            </dd>
          </div>
        </dl>
      </SectionCard>

      {/* Team on this brand */}
      <SectionCard
        icon={UsersIcon}
        title="Team on this brand"
        description={
          teammates.length === 0
            ? "You're the only person from your team with access right now."
            : `${teammates.length + 1} ${teammates.length + 1 === 1 ? 'person has' : 'people have'} access — including you.`
        }
      >
        <div className="divide-y divide-gray-50">
          {/* Self */}
          <TeammateRow
            name={ctx.user.name}
            email={ctx.user.email}
            isYou
            accent={accent}
          />
          {teammates.map((m) => (
            <TeammateRow
              key={m.email}
              name={m.name}
              email={m.email}
              accent={accent}
            />
          ))}
        </div>
        {accountManager && (
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40">
            <p className="text-xs text-gray-500">
              Want to invite someone else from your team?{' '}
              <a
                href={`mailto:${accountManager.email}?subject=Add%20teammate%20to%20${encodeURIComponent(ctx.activeBrand.display_name || ctx.activeBrand.name)}%20portal`}
                className="font-medium text-[#1A1B3A] hover:underline inline-flex items-center gap-0.5"
              >
                Email your account manager
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Subcomponents ──

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
        <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-gray-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#1A1B3A]">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-[#1A1B3A]">{value}</dd>
    </div>
  );
}

function TeammateRow({
  name,
  email,
  accent,
  isYou,
}: {
  name: string | null;
  email: string;
  accent: string;
  isYou?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}, #7C5CFC)` }}
      >
        {(name ?? email)[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1A1B3A] truncate">
          {name ?? email}
          {isYou && (
            <span className="ml-2 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              You
            </span>
          )}
        </p>
        {name && <p className="text-xs text-gray-500 truncate">{email}</p>}
      </div>
    </div>
  );
}
