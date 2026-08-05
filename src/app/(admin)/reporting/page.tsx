'use client';

/**
 * Reporting — client-facing only, organised by client.
 *
 * This was an outbox: a chronological log of everything sent, a create panel
 * with its own brand picker, and a schedules table. The work it supports is
 * not chronological. It is per client, low volume, and gated on whether the
 * data can honestly support a report.
 *
 * So the primary surface is a brand table (./brand-table) where coverage sits
 * in the row, and generating starts FROM a brand rather than re-picking one.
 * The sent feed survives as a demoted audit trail below.
 *
 * Cut in the rebuild:
 *  - Schedules. Zero rows since it shipped, and the one report type added
 *    since (Weekly KPI) is deliberately manual because two of its five
 *    sections have no data source.
 *  - The global brand picker inside Create, which was the one way to send
 *    brand A's numbers under brand B's name.
 *  - Creator posts, which moved to /drops. They go to your Discord, not to
 *    clients, and this page is client-facing now.
 */

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { BrandTable } from './brand-table';
import { CreatePanel } from './create-panel';
import { SentFeed } from './sent-feed';
import { FreshnessBanner } from './freshness-banner';

export default function ReportingPage() {
  // Bumped when something is sent, so the table and feed both refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  // Which brand the Create panel is scoped to. null = panel closed; the panel
  // is never open without a brand, because that was the old failure mode.
  const [target, setTarget] = useState<{ slug: string; name: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openFor = (slug: string, name: string) => {
    setTarget({ slug, name });
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="Client reporting"
        subtitle="What each client has received, and whether their data can support the next one."
      />

      <FreshnessBanner />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        {/* Create panel — pinned right at xl, and only ever rendered for a
            chosen brand. On small screens it stacks under the header. */}
        <div
          ref={panelRef}
          className={cn(
            'scroll-mt-20 xl:col-start-2 xl:row-start-1',
            'xl:sticky xl:top-[72px] xl:-m-3 xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:p-3',
            !target && 'hidden',
          )}
        >
          {target && (
            <div className="space-y-2">
              <div className="flex items-center justify-end">
                <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                  <X />
                  Close
                </Button>
              </div>
              <CreatePanel
                key={target.slug}
                lockedBrand={target.slug}
                lockedBrandName={target.name}
                onSent={() => setRefreshKey(k => k + 1)}
              />
            </div>
          )}
        </div>

        <div className={cn('space-y-8 xl:col-start-1 xl:row-start-1', !target && 'xl:col-span-2')}>
          <BrandTable refreshKey={refreshKey} onGenerate={openFor} />
          <SentFeed refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
