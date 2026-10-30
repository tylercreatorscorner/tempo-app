export default function LoadingReportVideos() {
  return <main className="min-h-screen bg-[#fbfbfd] px-4 py-10 text-[#171a33]">
    <div className="mx-auto max-w-5xl space-y-5" role="status" aria-label="Loading report videos">
      <div className="h-6 w-40 animate-pulse rounded bg-[#e9e8f1]" />
      <div className="h-24 animate-pulse rounded-xl bg-[#efedf6]" />
      <p className="text-sm text-[#6b7093]">Loading the videos behind this report…</p>
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg border border-[#e7e7f2] bg-white" />)}
    </div>
  </main>;
}
