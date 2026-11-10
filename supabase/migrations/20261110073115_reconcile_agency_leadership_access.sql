-- Reconcile the existing leadership directory with this branch's fresh installs.
-- Matches the deployed table introduced by the earlier agency-billing branch.
-- Existing designations remain untouched; no member receives access here.
create table if not exists public.agency_leadership_access (
 tenant_id uuid not null references public.tenants(id),
 user_id uuid not null,
 designation text not null check (designation in ('owner','vp')),
 created_at timestamptz not null default now(),
 primary key (tenant_id,user_id)
);

alter table public.agency_leadership_access enable row level security;
revoke all on public.agency_leadership_access from public,anon,authenticated;
grant select,insert,update,delete on public.agency_leadership_access to service_role;

-- No policies expose this directory to browser sessions. The server resolves a
-- designation with both trusted tenant_id and user_id before applying the gate.
-- Legacy billing tables, functions and triggers are deliberately not required.
