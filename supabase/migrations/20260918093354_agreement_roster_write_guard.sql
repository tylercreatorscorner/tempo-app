-- Trigger-only definer: inspect both source and destination relationships.
-- RLS still governs the roster write; callers cannot read the private ledger.
create or replace function public.guard_ledger_roster_terms()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target_brand uuid; expected jsonb;
begin
 if tg_op='UPDATE' then
  if new.retainer is not distinct from old.retainer and new.monthly_post_requirement is not distinct from old.monthly_post_requirement and new.brand is not distinct from old.brand and new.creator_id is not distinct from old.creator_id and new.tenant_id is not distinct from old.tenant_id then return new; end if;
  if new.brand is distinct from old.brand or new.creator_id is distinct from old.creator_id or new.tenant_id is distinct from old.tenant_id then
   if exists(select 1 from public.creator_agreement_ledgers l join public.brands_v2 b on b.id=l.brand_id and b.tenant_id=l.tenant_id where l.tenant_id=old.tenant_id and l.creator_id=old.creator_id and b.slug=old.brand) then
    raise exception 'This creator has agreement history. Manage the relationship from Agreements.';
   end if;
  end if;
 end if;
 select id into target_brand from public.brands_v2 where tenant_id=new.tenant_id and slug=new.brand;
 if exists(select 1 from public.creator_agreement_ledgers where tenant_id=new.tenant_id and creator_id=new.creator_id and brand_id=target_brand) then
  expected:=public.get_creator_agreement_terms(new.tenant_id,new.creator_id,target_brand,(now() at time zone 'America/Chicago')::date);
  if expected is null or new.retainer is distinct from (expected->>'retainer')::numeric or new.monthly_post_requirement is distinct from (expected->>'quota')::integer then
   raise exception 'Use the creator Agreements tab to change recorded terms.';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_ledger_roster_terms() from public,anon,authenticated;
drop trigger managed_creators_agreement_terms on public.managed_creators;
create trigger managed_creators_agreement_terms before insert or update on public.managed_creators for each row execute function public.guard_ledger_roster_terms();
