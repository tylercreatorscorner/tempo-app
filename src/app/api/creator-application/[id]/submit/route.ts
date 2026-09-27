import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { questionsSchema, submissionSchema } from '@/lib/applications/schema';
import { throttle } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 20000) return NextResponse.json({ error: 'Submission is too large.' }, { status: 413 });
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!throttle(`application:${id}:${ip}`, 10000)) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check your answers and try again.' }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const db = await createAdminClient();
  const { data: form, error } = await db.from('creator_application_forms')
    .select('id,tenant_id,brand_id,questions,version,active').eq('id', id).eq('active', true).maybeSingle();
  if (error || !form) return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  if (form.version !== parsed.data.formVersion) return NextResponse.json({ error: 'This form changed while you were filling it out. Reload the page to see the latest questions.' }, { status: 409 });
  const { data: brand } = await db.from('brands_v2').select('id').eq('id', form.brand_id)
    .eq('tenant_id', form.tenant_id).eq('is_archived', false).maybeSingle();
  if (!brand) return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  const questions = questionsSchema.safeParse(form.questions);
  if (!questions.success) return NextResponse.json({ error: 'This form is temporarily unavailable.' }, { status: 503 });
  const allowed = new Set(questions.data.map(question => question.id));
  if (Object.keys(parsed.data.answers).some(key => !allowed.has(key)) ||
      questions.data.some(question => question.required && !parsed.data.answers[question.id]?.trim())) {
    return NextResponse.json({ error: 'Please answer the required questions.' }, { status: 400 });
  }
  const { error: insertError } = await db.from('creator_application_submissions').insert({
    tenant_id: form.tenant_id, brand_id: form.brand_id, form_id: form.id, form_version: form.version,
    questions_snapshot: questions.data, answers: parsed.data.answers,
    full_name: parsed.data.fullName, email: parsed.data.email,
    tiktok_handle: parsed.data.tiktokHandle.replace(/^@/, ''),
    discord_username: parsed.data.discordUsername || null,
  });
  if (insertError) return NextResponse.json({ error: 'Could not submit. Please try again.' }, { status: 500 });
  // Do not disclose applicant identifiers or auto-create creator/Discord records.
  return NextResponse.json({ ok: true });
}
