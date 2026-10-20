import portal from '@/components/layout/portal-workspace.module.css';
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${portal.theme} ${portal.entry}`}>
      {children}
    </main>
  );
}
