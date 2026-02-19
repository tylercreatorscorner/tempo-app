export default function BrandsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Brands</h1>
      <p className="text-muted-foreground">Brand management coming soon.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['JiYu', 'Cata-Kor', 'Physicians Choice', 'TopLux'].map((name) => (
          <div key={name} className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">{name}</h3>
            <p className="text-sm text-muted-foreground mt-1">Details coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
