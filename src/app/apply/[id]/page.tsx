import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { questionsSchema } from '@/lib/applications/schema';
import { BrandPortrait } from '@/components/creators/brand-portrait';
import { PublicApplicationForm } from './public-application-form';
import { getApplicationDiscordIdentity } from '@/lib/applications/discord-identity';
import { isDiscordApplicationSignInAvailable } from '@/lib/applications/discord-oauth-config';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ discord?: string }> }) {
  const { id } = await params;
  const { discord } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createAdminClient();
  const { data: form } = await db.from('creator_application_forms')
    .select('id,tenant_id,brand_id,title,introduction,questions,version,active')
    .eq('id', id).eq('active', true).maybeSingle();
  if (!form) notFound();
  const { data: brand } = await db.from('brands_v2')
    .select('name,display_name,logo_url,color').eq('id', form.brand_id).eq('tenant_id', form.tenant_id)
    .eq('is_archived', false).maybeSingle();
  if (!brand) notFound();
  const questions = questionsSchema.safeParse(form.questions);
  if (!questions.success) notFound();
  const [identity, discordAvailable] = await Promise.all([
    getApplicationDiscordIdentity(id), isDiscordApplicationSignInAvailable(),
  ]);
  return <main className="min-h-screen bg-[#f8f7fb] px-4 py-10 text-[#1d1b25] sm:py-16">
    <div className="mx-auto max-w-2xl">
      <div className="mb-7 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6d42c8] text-sm font-bold text-white">T</span>
        <span className="text-sm font-semibold tracking-tight">Tempo</span>
        <span className="text-sm text-[#9a96a6]">/</span>
        <BrandPortrait name={brand.display_name || brand.name} source={brand.logo_url} color={brand.color} size={28} />
        <span className="text-sm text-[#5c5867]">{brand.display_name || brand.name}</span>
      </div>
      <section className="rounded-2xl border border-[#e9e5ef] bg-white p-6 shadow-[0_12px_40px_-28px_rgba(42,24,90,.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#6d42c8]">Creator opportunity</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{form.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#696473]">{form.introduction || `Apply to work with ${brand.display_name || brand.name}. The brand team will review your submission.`}</p>
        <PublicApplicationForm formId={form.id} formVersion={form.version} questions={questions.data} identity={identity} discordOutcome={discord} discordAvailable={discordAvailable} />
      </section>
      <p className="mt-5 text-center text-xs text-[#8a8494]">Submitting an application does not guarantee acceptance or Discord access. <a href="/privacy" className="underline underline-offset-2">Privacy policy</a></p>
    </div>
  </main>;
}
