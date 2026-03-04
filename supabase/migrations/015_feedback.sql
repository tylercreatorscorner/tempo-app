-- Feedback widget table
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid,
  rating smallint check (rating between 1 and 5),
  message text,
  page_url text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Tenants can insert own feedback"
  on public.feedback for insert
  with check (tenant_id = (select current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can read own feedback"
  on public.feedback for select
  using (tenant_id = (select current_setting('app.current_tenant_id', true))::uuid);
