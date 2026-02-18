export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="h-14 border-b border-border flex items-center px-6">
        <span className="font-semibold">Creator Portal</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
