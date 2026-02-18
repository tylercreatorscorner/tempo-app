export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="h-14 border-b border-border flex items-center px-6">
        <span className="font-semibold">Brand Portal</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
