import { Mail, User } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';

export const dynamic = 'force-dynamic';

export default async function BrandSettingsPage() {
  const ctx = await requireBrandPortalContext();

  return (
    <div className="space-y-6 max-w-[800px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your account and brand preferences.
        </p>
      </div>

      {/* Profile */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
          <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center">
            <User className="h-4 w-4 text-gray-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
            <p className="text-xs text-gray-500">Your account details</p>
          </div>
        </div>
        <dl className="divide-y divide-gray-50">
          <Row label="Name" value={ctx.user.name ?? '—'} />
          <Row label="Email" value={ctx.user.email} />
          <Row
            label="Brand"
            value={ctx.activeBrand.display_name || ctx.activeBrand.name}
          />
        </dl>
      </div>

      {/* Notifications (stub) */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
          <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center">
            <Mail className="h-4 w-4 text-gray-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <p className="text-xs text-gray-500">Weekly and monthly summaries</p>
          </div>
        </div>
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-gray-500">
            Email notifications are coming soon.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            For now, use the Reports tab to download your data on demand.
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Need to update your account info? Reach out to your account manager.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}
