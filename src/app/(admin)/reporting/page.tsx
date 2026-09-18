'use client';

import styles from './workspace.module.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { BrandTable } from './brand-table';
import { CreatePanel } from './create-panel';
import { SentFeed } from './sent-feed';
import { FreshnessBanner } from './freshness-banner';
import { AgencyPanel } from './agency-panel';

export default function ReportingPage() {
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  useEffect(() => {
    const reset = () => setWorkspaceVersion(version => version + 1);
    window.addEventListener('workspace-context-changed', reset);
    return () => window.removeEventListener('workspace-context-changed', reset);
  }, []);
  return <ReportingWorkspace key={workspaceVersion} />;
}

function ReportingWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<'clients' | 'agency' | 'library'>('clients');
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['clients']));
  const [target, setTarget] = useState<{ slug: string; name: string } | null>(null);
  return (
    <div className={`${styles.workspace} space-y-5`}>
      <PageHeader title="Reporting" subtitle="Clear client updates. Every shared version preserved." />
      {target && (
        <div className="mx-auto max-w-4xl space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setTarget(null)}><ArrowLeft />Back to client reports</Button>
          <CreatePanel key={target.slug} lockedBrand={target.slug} lockedBrandName={target.name} onSent={() => setRefreshKey(k => k + 1)} />
        </div>
      )}
        <div hidden={Boolean(target)} className="space-y-5">
          <nav aria-label="Reporting views" className="flex gap-5 overflow-x-auto border-b border-border">
            {([['clients', 'Client reports'], ['agency', 'Agency reports'], ['library', 'Report library']] as const).map(([key, label]) => (
              <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => { setView(key); setVisited(previous => new Set([...previous, key])); }} className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${view === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </nav>
          <div hidden={view !== 'clients'} className="space-y-4"><FreshnessBanner /><BrandTable refreshKey={refreshKey} onGenerate={(slug, name) => setTarget({ slug, name })} /></div>
          {visited.has('agency') && <div hidden={view !== 'agency'} className="max-w-3xl space-y-4"><AgencyPanel /><Link href="/reporting/weekly" className="inline-flex text-sm font-medium text-primary hover:underline">Open internal weekly review →</Link></div>}
          {visited.has('library') && <div hidden={view !== 'library'}><SentFeed refreshKey={refreshKey} /></div>}
        </div>
    </div>
  );
}
