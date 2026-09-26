'use client';

import { InterfaceIcon } from '@/components/ui/interface-icon';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Show a blurred mock preview behind the empty state */
  mockContent?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  mockContent,
}: EmptyStateProps) {
  return (
    <div className="relative rounded-2xl border border-border bg-card overflow-hidden">
      {/* Mock content (blurred background) */}
      {mockContent && (
        <div className="absolute inset-0 blur-[4px] opacity-30 pointer-events-none select-none p-6">
          {mockContent}
        </div>
      )}

      {/* Empty state content */}
      <div className="relative z-10 flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">{description}</p>

        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-[var(--primary)]/20"
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors underline"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Pre-built empty states for common dashboard sections */
export function EmptyDashboard() {
  return (
    <EmptyState
      icon={<InterfaceIcon name="chart" className="size-6"/>}
      title="Your dashboard is ready"
      description="Connect your shop and import data to see GMV, creator performance and product analytics."
      actionLabel="Connect TikTok Shop"
      actionHref="/workflows/integrations"
    />
  );
}

export function EmptyCreators() {
  return (
    <EmptyState
      icon={<InterfaceIcon name="people" className="size-6"/>}
      title="No creators yet"
      description="Upload your managed roster or connect TikTok to automatically discover your affiliate creators."
      actionLabel="Add Creators"
      actionHref="/roster"
      secondaryLabel="Upload CSV instead"
      secondaryHref="/roster"
    />
  );
}

export function EmptyVideos() {
  return (
    <EmptyState
      icon={<InterfaceIcon name="video" className="size-6"/>}
      title="No video data yet"
      description="Video performance appears after a successful import. Check Connections and Data & Imports for progress."
      actionLabel="Connect TikTok Shop"
      actionHref="/workflows/integrations"
    />
  );
}

export function EmptyAnalytics() {
  return (
    <EmptyState
      icon={<InterfaceIcon name="chart" className="size-6"/>}
      title="Analytics will appear here"
      description="Connect your shop and check import coverage before generating an analytics report."
      actionLabel="Connect TikTok Shop"
      actionHref="/workflows/integrations"
    />
  );
}

export function EmptyMessages() {
  return (
    <EmptyState
      icon={<InterfaceIcon name="message" className="size-6"/>}
      title="No messages yet"
      description="Connect Discord to enable creator messaging, bulk outreach, and inbound DM logging."
      actionLabel="Connect Discord"
      actionHref="/workflows/integrations"
    />
  );
}
