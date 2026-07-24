'use client';

/**
 * Reporting — the Outbox. One feed of everything that went out (client report
 * links + creator posts), the schedule strip below it, and a Create panel
 * that is a persistent right column at xl (per the approved v3 mockup) and
 * opens on demand below that.
 *
 * Composition: sent feed in ./sent-feed, the two-mode Create panel in
 * ./create-panel, schedules in ./schedules-tab, staleness net in
 * ./freshness-banner.
 */

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SentFeed } from './sent-feed';
import { CreatePanel } from './create-panel';
import { SchedulesTab } from './schedules-tab';
import { FreshnessBanner } from './freshness-banner';

export default function ReportingPage() {
  // Bumped whenever the Create panel sends something, so the feed refetches.
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  // Below xl the panel is hidden until "+ Create report"; at xl it is always
  // visible (the button just scrolls it into view).
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    setPanelOpen(true);
    // Wait a frame so the panel is un-hidden before we scroll to it.
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="Outbox"
        subtitle="Client report links, creator posts, and everything on a schedule."
        actions={
          <Button onClick={openPanel}>
            <Plus />
            Create report
          </Button>
        }
      />

      <FreshnessBanner />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        {/* Create panel — first in DOM so it stacks right under the header on
            small screens; explicit col/row placement pins it right at xl.
            Sticky with its own scroll so a tall generated preview never pins
            the page. The -m-3/p-3 ring keeps the card shadow unclipped. */}
        <div
          ref={panelRef}
          className={cn(
            'scroll-mt-20 xl:col-start-2 xl:row-start-1',
            'xl:sticky xl:top-[72px] xl:-m-3 xl:max-h-[calc(100vh-84px)] xl:overflow-y-auto xl:p-3',
            !panelOpen && 'hidden xl:block',
          )}
        >
          <CreatePanel onSent={() => setFeedRefreshKey(k => k + 1)} />
        </div>

        <div className="space-y-8 xl:col-start-1 xl:row-start-1">
          <SentFeed refreshKey={feedRefreshKey} />
          <SchedulesTab />
        </div>
      </div>
    </div>
  );
}
