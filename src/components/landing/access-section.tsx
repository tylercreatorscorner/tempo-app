import Link from 'next/link';

export function AccessSection() {
  return (
    <section id="get-started" className="bg-[#F8F9FC] px-4 py-16 sm:px-6 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#FF4D8D]">Get started</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-[#1A1B3A] md:text-5xl">
          Bring your creator operations together.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#6B7280]">
          Set up your workspace, connect your shop, and start managing your creators.
          No payment details required.
        </p>
        <Link href="/onboarding" className="mt-8 inline-flex rounded-xl bg-[#1A1B3A] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#30325c]">
          Create your workspace
        </Link>
      </div>
    </section>
  );
}
