import Link from 'next/link';
import { TempoLogo } from '@/components/ui/tempo-logo';
import portal from '@/components/layout/portal-workspace.module.css';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${portal.theme} min-h-screen`}>
      <a href="#manager-content" className={portal.skipLink}>Skip to content</a>
      <header className="h-14 border-b border-border bg-card flex items-center gap-4 px-5">
        <Link href="/dashboard" aria-label="Tempo home"><TempoLogo size="sm" /></Link>
        <span className="border-l border-border pl-4 text-sm font-medium text-muted-foreground">Manager workspace</span>
      </header>
      <main id="manager-content" tabIndex={-1} className={portal.content}>{children}</main>
    </div>
  );
}
