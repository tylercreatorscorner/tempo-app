/**
 * /api/brands/[id]/logo
 *
 * POST   — upload a brand logo (multipart/form-data, field `file`)
 * DELETE — remove it
 *
 * brands_v2.logo_url has been read by the brand portal since it was built, but
 * nothing ever wrote to it: measured 2026-08-10, 28 of 28 active brands had a
 * colour and 0 had a logo, because there was no bucket and no upload path.
 *
 * ── Trust model ─────────────────────────────────────────────────────────────
 *
 * requireAdmin gates the route, and the write itself uses the service role.
 * The `brand-logos` bucket grants write to service_role ONLY (migration 145),
 * so an ordinary authenticated session cannot put objects there even with a
 * valid JWT. This route is the only writer.
 *
 * The uploaded bytes are NOT trusted:
 *   · the MIME type is taken from a magic-number sniff of the first bytes, not
 *     from the client-supplied Content-Type, which is attacker-controlled;
 *   · SVG is rejected outright (it can carry <script>);
 *   · the stored object key is derived from the brand id and a random suffix,
 *     never from the uploaded filename, so a crafted name cannot traverse
 *     paths or collide with another brand's object.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BUCKET = 'brand-logos';
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Identify the image from its leading bytes. The browser's Content-Type is a
 * claim by the caller; this is evidence. Returns null for anything not on the
 * allow-list, which includes SVG (text, and script-bearing) by construction.
 */
function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Missing brand id' }, { status: 400 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 }); }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided. Attach it as the `file` field.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That logo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB — export it smaller.` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: 'That is not a PNG, JPEG or WebP image. SVG is not accepted; export a PNG instead.' },
      { status: 400 },
    );
  }

  const admin = await createAdminClient();

  // Confirm the brand exists before writing an orphan object, and grab the
  // previous logo so it can be cleaned up after the new one is in place.
  const { data: brand, error: brandErr } = await admin
    .from('brands_v2')
    .select('id, slug, logo_url')
    .eq('id', id)
    .maybeSingle();
  if (brandErr) return NextResponse.json({ error: `brand lookup failed: ${brandErr.message}` }, { status: 500 });
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  // Key is derived, never taken from the upload. The random suffix also busts
  // any CDN cache of a previous logo at the same brand.
  const key = `${brand.id}/${randomBytes(8).toString('hex')}.${kind.ext}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType: kind.mime, upsert: false });
  if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
  const logoUrl = pub.publicUrl;

  const { error: saveErr } = await admin
    .from('brands_v2')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', brand.id);
  if (saveErr) {
    // Don't leave the object behind if the row never got the pointer.
    await admin.storage.from(BUCKET).remove([key]);
    return NextResponse.json({ error: `could not save logo: ${saveErr.message}` }, { status: 500 });
  }

  // Best-effort cleanup of the old object. A failure here costs storage, not
  // correctness, so it must not fail the request.
  const oldKey = keyFromPublicUrl(brand.logo_url);
  if (oldKey && oldKey !== key) {
    await admin.storage.from(BUCKET).remove([oldKey]).catch(() => {});
  }

  return NextResponse.json({ ok: true, logo_url: logoUrl });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Missing brand id' }, { status: 400 });

  const admin = await createAdminClient();
  const { data: brand } = await admin
    .from('brands_v2').select('id, logo_url').eq('id', id).maybeSingle();
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  const { error } = await admin
    .from('brands_v2')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', brand.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const key = keyFromPublicUrl(brand.logo_url);
  if (key) await admin.storage.from(BUCKET).remove([key]).catch(() => {});

  return NextResponse.json({ ok: true, logo_url: null });
}

/** Recover the storage key from a public URL we previously wrote. Returns null
 *  for anything that is not one of ours, so cleanup can never delete an object
 *  in another bucket. */
function keyFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const key = url.slice(i + marker.length).split('?')[0];
  return key || null;
}
