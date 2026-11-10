-- Private editorial revisions are separate from issued bearer reports.
-- No publish operation, bearer token, public history entry, or original-row write.
create table public.client_report_revision_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  source_report_id uuid not null references public.client_reports(id) on delete restrict,
  brand_slug text not null,
  brand_name text not null,
  report_type text not null check (report_type in ('performance', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  period_label text not null,
  status text not null default 'draft' check (status = 'draft'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and snapshot ? 'report' and jsonb_typeof(snapshot->'report') = 'object' and not (snapshot ? 'reconciliation')),
  notes text check (notes is null or length(notes) <= 2000),
  plan text check (plan is null or length(plan) <= 2000),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_report_revision_drafts_source_idx on public.client_report_revision_drafts(tenant_id, source_report_id);
alter table public.client_report_revision_drafts enable row level security;
revoke all on public.client_report_revision_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.client_report_revision_drafts to service_role;

-- Enforce immutable source identity even for manual service-role draft inserts.
-- This is an invoker trigger; it does not grant any privileged read capability.
create function public.validate_client_report_revision_draft_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
    (new.tenant_id, new.source_report_id, new.brand_slug, new.report_type, new.period_start, new.period_end)
    is distinct from
    (old.tenant_id, old.source_report_id, old.brand_slug, old.report_type, old.period_start, old.period_end)
  then
    raise exception 'Private revision source identity is immutable';
  end if;
  if not exists (
    select 1 from public.client_reports r
    where r.id = new.source_report_id and r.tenant_id = new.tenant_id
      and r.brand_slug = new.brand_slug and r.report_type = new.report_type
      and r.period_start = new.period_start and r.period_end = new.period_end
  ) then
    raise exception 'Private revision source does not match its tenant, brand, type and period';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.validate_client_report_revision_draft_source() from public, anon, authenticated;
grant execute on function public.validate_client_report_revision_draft_source() to service_role;
create trigger validate_client_report_revision_draft_source
before insert or update on public.client_report_revision_drafts
for each row execute function public.validate_client_report_revision_draft_source();

comment on table public.client_report_revision_drafts is 'Private editorial review only. Not a client_reports publication queue; no public bearer token.';
