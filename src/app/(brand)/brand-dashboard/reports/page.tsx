import { FileSpreadsheet, Mail, Sparkles } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import portal from '@/components/layout/portal-workspace.module.css';
import { ReportBuilder } from './report-builder';

export const dynamic = 'force-dynamic';

export default async function BrandReportsPage() {
  const ctx = await requireBrandPortalContext();
  const accent = ctx.activeBrand.color || '#6e4bcc';
  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}>
        <div>
          <p className={portal.eyebrow}>Client workspace</p>
          <h1>Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Export your creator roster or post performance for a selected period.</p>
        </div>
      </div>
      <div className={portal.split}>
        <ReportBuilder accentColor={accent} />
        <aside className={portal.stack} aria-label="Report help">
          <div className={portal.panel}>
            <div className={portal.panelHeader}><h2 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4 text-primary" />About your export</h2></div>
            <div className="space-y-3 p-4 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">Creator roster</span> includes GMV, orders, published posts, and recorded retainers per creator.</p>
              <p><span className="font-medium text-foreground">Posts log</span> includes TikTok links, GMV, and orders for each post.</p>
              <p>CSV files open in Excel or Google Sheets. The selected reporting period determines the sales included.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div><h2 className="text-sm font-semibold">Need a custom report?</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Ask your account manager for custom date ranges, specific metrics, or a client-ready PDF.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Recurring reports</h2><span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Coming soon</span></div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Scheduled email delivery is being built. Contact your account manager to request early access.</p></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
