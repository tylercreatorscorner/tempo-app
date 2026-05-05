export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { User, Building2, Database, Bell, Key, Shield } from 'lucide-react';
import { TikTokConnect } from '@/components/onboarding/tiktok-connect';
import { PlanSelector } from '@/components/onboarding/plan-selector';
import { UserManagement } from '@/components/settings/user-management';
import { CreatorInvitesSection } from '@/components/settings/creator-invites-section';
import { TeamMembersSection } from '@/components/settings/team-members-section';
import { CompensationArrangementsSection } from '@/components/settings/compensation-arrangements-section';
import { BRAND_COLORS } from '@/lib/utils/constants';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Load profile + tenant + brands dynamically
  let profile: { name: string; email: string; role: string; tenant_id: string } | null = null;
  let tenant: { name: string; tiktok_connected: boolean; discord_connected: boolean; stripe_subscription_id: string | null; plan: string | null } | null = null;
  let brands: { id: string; name: string; slug: string; color: string | null; display_name: string | null }[] = [];
  let teamMembers: { user_id: string; email: string; name: string | null; role: string; status: string; brand_access: string[] }[] = [];

  if (user) {
    const { data: p } = await supabase
      .from('user_profiles')
      .select('name, email, role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();
    profile = p;

    if (p?.tenant_id) {
      const { data: t } = await supabase
        .from('tenants')
        .select('name, tiktok_connected, discord_connected, stripe_subscription_id, plan')
        .eq('id', p.tenant_id)
        .single();
      tenant = t;

      const { data: b } = await supabase
        .from('brands_v2')
        .select('id, name, slug, color, display_name')
        .order('name');
      brands = b || [];

      // Load team members (non-creator roles)
      const { data: members } = await supabase
        .from('user_profiles')
        .select('user_id, email, name, role, status')
        .neq('role', 'creator')
        .order('role');

      // Load brand access for scoped roles
      const { data: accessRows } = await supabase
        .from('user_brand_access')
        .select('user_id, brand_id');

      teamMembers = (members || []).map(m => ({
        ...m,
        brand_access: (accessRows || []).filter(a => a.user_id === m.user_id).map(a => a.brand_id),
      }));
    }
  }

  const displayName = profile?.name || user?.user_metadata?.full_name || 'User';
  const email = profile?.email || user?.email || '';
  const role = profile?.role === 'admin' || profile?.role === 'owner' ? 'Owner' : 'Member';
  const tiktokConnected = tenant?.tiktok_connected || false;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and application configuration
        </p>
      </div>

      {/* TikTok Connection */}
      <Suspense>
        <TikTokConnect companyName={tenant?.name} connected={tiktokConnected} />
      </Suspense>

      {/* Plan Selection */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6">
          <Suspense>
            <PlanSelector currentPlan={tenant?.stripe_subscription_id ? (tenant.plan || 'brand') : undefined} />
          </Suspense>
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Profile</h2>
            <p className="text-sm text-muted-foreground">Manage your account details and preferences</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-muted-foreground w-32 shrink-0">Display Name</label>
            <input type="text" defaultValue={displayName} disabled className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm disabled:opacity-60" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-muted-foreground w-32 shrink-0">Email</label>
            <input type="email" defaultValue={email} disabled className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm disabled:opacity-60" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-muted-foreground w-32 shrink-0">Role</label>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
              <Shield className="h-3 w-3 mr-1" /> {role}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-muted-foreground w-32 shrink-0">Timezone</label>
            <input type="text" defaultValue="America/Chicago (CST)" disabled className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm disabled:opacity-60" />
          </div>
        </div>
      </div>

      {/* Brand Management */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Brand Management</h2>
            <p className="text-sm text-muted-foreground">Configure brands and their settings</p>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {brands.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No brands connected yet. Connect TikTok Shop to get started.</p>
          ) : (
            brands.map((brand) => {
              const color = brand.color || BRAND_COLORS[brand.slug] || '#6B7280';
              return (
                <div key={brand.slug} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>
                      {(brand.display_name || brand.name).charAt(0)}
                    </div>
                    <span className="font-medium text-sm">{brand.display_name || brand.name}</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-50 text-green-600">active</span>
                </div>
              );
            })
          )}
          <button className="mt-2 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            + Add Brand
          </button>
        </div>
      </div>

      {/* Data Sources */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Data Sources</h2>
            <p className="text-sm text-muted-foreground">Connected data integrations</p>
          </div>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
            <div>
              <p className="font-medium text-sm">TikTok Shop</p>
              <p className="text-xs text-muted-foreground">{tiktokConnected ? 'Syncing daily' : 'Not connected'}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${tiktokConnected ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {tiktokConnected ? 'connected' : 'pending'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
            <div>
              <p className="font-medium text-sm">Discord</p>
              <p className="text-xs text-muted-foreground">{tenant?.discord_connected ? 'Bot active' : 'Not connected'}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${tenant?.discord_connected ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {tenant?.discord_connected ? 'connected' : 'pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Notifications</h2>
            <p className="text-sm text-muted-foreground">Configure alerts and notification preferences</p>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {['Daily Performance Summary', 'New Creator Alerts', 'GMV Milestone Alerts', 'Weekly Report Email'].map((label) => (
            <div key={label} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <span className="text-sm">{label}</span>
              <div className="relative w-11 h-6 rounded-full bg-muted transition-colors cursor-not-allowed">
                <div className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2">Notification preferences coming soon.</p>
        </div>
      </div>

      {/* Team Members - only show for owner/admin */}
      {(profile?.role === 'owner' || profile?.role === 'admin') && (
        <UserManagement
          users={teamMembers}
          brands={brands}
          tenantId={profile.tenant_id}
          currentUserId={user?.id ?? ''}
        />
      )}

      {/* Creator Invites — admin only. Generates per-brand /join/[code] links. */}
      {(profile?.role === 'owner' || profile?.role === 'admin') && profile?.tenant_id && (
        <CreatorInvitesSection
          tenantId={profile.tenant_id}
          brands={brands.map(b => ({ slug: b.slug, name: b.name, display_name: b.display_name }))}
        />
      )}

      {/* Team Members + per-(brand × payee) compensation arrangements.
          Admin-only. Drives invoicing + earnings split between Tyler / Vic /
          future collaborators. */}
      {(profile?.role === 'owner' || profile?.role === 'admin') && (
        <>
          <TeamMembersSection />
          <CompensationArrangementsSection
            brands={brands.map(b => ({ slug: b.slug, name: b.name, display_name: b.display_name }))}
          />
        </>
      )}

      {/* API Keys - only show if they have brands */}
      {brands.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">API Keys</h2>
              <p className="text-sm text-muted-foreground">Manage API access tokens</p>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-muted-foreground py-4 text-center">API access coming soon. Contact support for early access.</p>
          </div>
        </div>
      )}
    </div>
  );
}
