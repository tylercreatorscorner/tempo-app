'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  icon: string;
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
    <div className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Mock content (blurred background) */}
      {mockContent && (
        <div className="absolute inset-0 blur-[4px] opacity-30 pointer-events-none select-none p-6">
          {mockContent}
        </div>
      )}

      {/* Empty state content */}
      <div className="relative z-10 flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">{description}</p>

        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20"
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
      icon="📊"
      title="Your dashboard is ready"
      description="Connect your TikTok Shop to start seeing real-time GMV, creator performance, and product analytics."
      actionLabel="Connect TikTok Shop"
      actionHref="/settings"
    />
  );
}

export function EmptyCreators() {
  return (
    <EmptyState
      icon="👥"
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
      icon="🎬"
      title="No video data yet"
      description="Once your TikTok Shop is connected, video performance data will appear here automatically."
      actionLabel="Connect TikTok Shop"
      actionHref="/settings"
    />
  );
}

export function EmptyAnalytics() {
  return (
    <EmptyState
      icon="📈"
      title="Analytics will appear here"
      description="Connect your TikTok Shop and let the data sync. Your first analytics report will be ready within 24 hours."
      actionLabel="Connect TikTok Shop"
      actionHref="/settings"
    />
  );
}

export function EmptyMessages() {
  return (
    <EmptyState
      icon="💬"
      title="No messages yet"
      description="Connect Discord to enable creator messaging, bulk outreach, and inbound DM logging."
      actionLabel="Connect Discord"
      actionHref="/settings"
    />
  );
}
