-- 145_brand_logos_bucket.sql
--
-- Storage for brand logos.
--
-- brands_v2.logo_url has existed and been read by the brand portal since the
-- portal was built, but nothing has ever written to it: measured 2026-08-10,
-- 28 of 28 active brands have a colour and 0 have a logo. There was no bucket
-- to put one in.
--
-- ── Why public ──────────────────────────────────────────────────────────────
--
-- A logo is not a secret; it is the client's own mark, which they publish
-- themselves. Public read means the brand portal, invoice PDFs and emailed
-- documents can reference the URL directly with no signing round-trip, and no
-- expiring link that would silently break an already-sent PDF.
--
-- ── Why no SVG ──────────────────────────────────────────────────────────────
--
-- SVG is a script-bearing format. An uploaded .svg served from storage can
-- carry <script> and would execute against the storage origin. The upside over
-- PNG for a logo at the sizes we render (20-44px chips, one PDF mark) does not
-- justify accepting an XSS vector on a surface clients can reach, so the MIME
-- allow-list is raster only. If a vector mark is ever genuinely needed,
-- rasterise it on upload rather than relaxing this.
--
-- ── Writes go through the API, not the client ───────────────────────────────
--
-- No INSERT/UPDATE/DELETE policy is granted to `authenticated`. Uploads are
-- performed by /api/brands/[id]/logo behind requireAdmin using the service
-- role, so an ordinary session cannot write to this bucket even with a valid
-- JWT. Storage policies are the second lock, not the only one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
  true,
  2 * 1024 * 1024,                                    -- 2 MB; a logo that needs more is wrong
  array['image/png', 'image/jpeg', 'image/webp']       -- deliberately no image/svg+xml
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read a logo. This is what makes <img src> work in the portal and
-- in an emailed invoice without a signed URL.
drop policy if exists "brand logos are publicly readable" on storage.objects;
create policy "brand logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'brand-logos');

-- Writes are service-role only. Named explicitly rather than left to the
-- default so it is obvious this was a decision.
drop policy if exists "brand logos are service-role writable" on storage.objects;
create policy "brand logos are service-role writable"
  on storage.objects for all
  to service_role
  using (bucket_id = 'brand-logos')
  with check (bucket_id = 'brand-logos');
