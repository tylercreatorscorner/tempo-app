'use client';

import { Lock, ArrowRight, MessageSquare, CreditCard, Compass, FileBarChart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOnboarding } from '@/hooks/use-onboarding';

const UNGATED_PATHS = ['/settings', '/roster', '/dashboard'];

const PAGE_META: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
  '/messages': {
    title: 'Messages',
    description: 'Send and receive messages with your creators directly from Tempo once Discord is connected.',
    icon: <MessageSquare className="h-8 w-8 text-white" />,
  },
  '/payments': {
    title: 'Payments',
    description: 'Track retainers, commissions, invoices, and ROI across all your creators.',
    icon: <CreditCard className="h-8 w-8 text-white" />,
  },
  '/discover': {
    title: 'Discover',
    description: 'Browse trending videos, rising creators, and winning products across all of TikTok Shop.',
    icon: <Compass className="h-8 w-8 text-white" />,
  },
  '/reporting': {
    title: 'Reporting',
    description: 'Generate automated reports and schedule performance updates for Discord, Slack, and email.',
    icon: <FileBarChart className="h-8 w-8 text-white" />,
  },
};

interface DashboardGateProps {
  children: React.ReactNode;
}

export function DashboardGate({ children }: DashboardGateProps) {
  const { isGated, steps, loading } = useOnboarding();
  const pathname = usePathname();

  const isUngatedPage = UNGATED_PATHS.some(p => pathname?.startsWith(p));

  if (loading) return <>{children}</>;
  if (!isGated || isUngatedPage) return <>{children}</>;

  const incompleteRequired = steps.filter(s => s.required && !s.complete);
  if (incompleteRequired.length === 0) return <>{children}</>;

  const pageMeta = PAGE_META[pathname || ''] || {
    title: 'This Page',
    description: 'Complete your setup to access this feature.',
    icon: <Lock className="h-8 w-8 text-white" />,
  };

  // Don't render children at all — show a clean locked state instead
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Page icon */}
        <div className="inline-flex h-20 w-20 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] items-center justify-center mx-auto shadow-xl shadow-[var(--primary)]/20">
          {pageMeta.icon}
        </div>

        {/* Title + description */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">{pageMeta.title}</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">{pageMeta.description}</p>
        </div>

        {/* Required steps */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 justify-center">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Complete setup to unlock</p>
          </div>
          <div className="space-y-2">
            {incompleteRequired.map((step) => (
              <Link
                key={step.id}
                href={step.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/50 hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5 transition-all text-left group"
              >
                <span className="text-lg">{step.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[var(--primary)] transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
