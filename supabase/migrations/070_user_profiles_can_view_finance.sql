-- Per-member Finance access. Applied to prod via the Supabase MCP; mirrored here.
--
-- Default true so NO existing user loses access; new brand-scoped team members are
-- invited with false (least privilege — set in inviteUser). Owner/admin/viewer
-- always see finance regardless of this column (forced in getWorkspaceScope).
--
-- Enforcement lives in code, not RLS (the finance routes use the admin client and
-- bypass RLS): getWorkspaceScope surfaces `canViewFinance`, and every finance page
-- (/earnings, /ytd, /invoicing, /payments) + API (/api/earnings, /api/earnings/ytd,
-- /api/earnings/series, /api/invoices[/*], /api/payments/*) returns 403/redirect
-- when it's false. This is the small, forward-compatible shape of the
-- agency-permissions-redesign "finance department" axis.
alter table public.user_profiles
  add column if not exists can_view_finance boolean not null default true;
