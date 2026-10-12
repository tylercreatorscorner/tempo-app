-- Discord is read-only. These service-only records audit additive Tempo tags.
create table public.creator_role_sync_configs (
 brand_id uuid primary key references public.brands_v2(id), tenant_id uuid not null,
 guild_id text not null unique check(guild_id ~ '^[0-9]{17,20}$'),
 role_id text not null check(role_id ~ '^[0-9]{17,20}$'), role_name text not null check(lower(trim(role_name)) in ('elite','elites')),
 revision integer not null default 1, updated_by uuid not null, updated_at timestamptz not null default now()
);
create table public.creator_role_sync_runs (
 id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands_v2(id), tenant_id uuid not null,
 actor_id uuid not null, config_revision integer not null, guild_id text not null, role_id text not null,
 checked_at timestamptz not null default now(), applied_at timestamptz, scanned integer not null,
 retained jsonb not null default '[]', missing_identities integer not null default 0
);
create index creator_role_sync_runs_brand_recent on public.creator_role_sync_runs(tenant_id,brand_id,checked_at desc);
create table public.creator_role_sync_members (
 run_id uuid not null references public.creator_role_sync_runs(id), discord_id text not null check(discord_id ~ '^[0-9]{17,20}$'),
 display_name text not null, roster_id integer, creator_id uuid, creator_name text, state text not null check(state in ('matched','unmatched','conflict')),
 identity_claims text[] not null default '{}', already_tagged boolean not null default false,
 primary key(run_id,discord_id)
);
create table public.creator_role_sync_changes (
 run_id uuid not null references public.creator_role_sync_runs(id), roster_id integer not null,
 before_tags text[], after_tags text[] not null, changed_by uuid not null, changed_at timestamptz not null default now(),
 primary key(run_id,roster_id)
);
alter table public.creator_role_sync_configs enable row level security;
alter table public.creator_role_sync_runs enable row level security;
alter table public.creator_role_sync_members enable row level security;
alter table public.creator_role_sync_changes enable row level security;
revoke all on public.creator_role_sync_configs,public.creator_role_sync_runs,public.creator_role_sync_members,public.creator_role_sync_changes from public,anon,authenticated;
grant all on public.creator_role_sync_configs,public.creator_role_sync_runs,public.creator_role_sync_members,public.creator_role_sync_changes to service_role;

create table public.creator_role_sync_links (
 run_id uuid not null references public.creator_role_sync_runs(id), roster_id integer not null, discord_id text not null,
 linked_by uuid not null, linked_at timestamptz not null default now(), primary key(run_id,discord_id)
);
alter table public.creator_role_sync_links enable row level security;
revoke all on public.creator_role_sync_links from public,anon,authenticated;
grant all on public.creator_role_sync_links to service_role;

create function public.authorize_creator_cohort_actor(p_actor uuid,p_brand uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare actor public.user_profiles%rowtype; brand public.brands_v2%rowtype;
begin
 select * into actor from user_profiles where user_id=p_actor and status='active' for share;
 if not found or actor.role not in ('owner','admin','manager') then raise exception 'Not permitted' using errcode='42501';end if;
 select * into brand from brands_v2 where id=p_brand and tenant_id=actor.tenant_id and not is_archived for share;
 if not found then raise exception 'Brand not in access' using errcode='42501';end if;
 if not exists(select 1 from role_permissions rp join roles r on r.id=rp.role_id where r.tenant_id=actor.tenant_id and (case when actor.role_id is not null then r.id=actor.role_id else r.key=actor.role end) and rp.screen='roster' and rp.level='write') then raise exception 'Roster write not permitted' using errcode='42501';end if;
 if actor.role='manager' then
  perform 1 from brand_manager_assignments where brand_id=p_brand and manager_user_id=p_actor for share;
  if not found or not exists(select 1 from user_brand_access where user_id=p_actor and brand_id=p_brand) then raise exception 'Accountable manager required' using errcode='42501';end if;
 end if;
 return actor.tenant_id;
end $$;

create function public.link_creator_cohort_member(p_actor uuid,p_run uuid,p_discord text,p_roster integer) returns void language plpgsql security invoker set search_path=public as $$
declare run public.creator_role_sync_runs%rowtype; tenant uuid; member public.creator_role_sync_members%rowtype; target public.managed_creators%rowtype; canonical public.creators_v2%rowtype; config public.creator_role_sync_configs%rowtype;
begin
 select * into run from creator_role_sync_runs where id=p_run and actor_id=p_actor for update;
 if not found then raise exception 'Scan not in access' using errcode='42501';end if;
 tenant:=authorize_creator_cohort_actor(p_actor,run.brand_id);
 if tenant<>run.tenant_id or run.applied_at is not null or run.checked_at<now()-interval '15 minutes' then raise exception 'Check Discord again' using errcode='40001';end if;
 select * into config from creator_role_sync_configs where brand_id=run.brand_id and tenant_id=tenant and revision=run.config_revision for share;
 if not found then raise exception 'Role mapping changed; check Discord again' using errcode='40001';end if;
 select * into member from creator_role_sync_members where run_id=p_run and discord_id=p_discord and state='unmatched' for update;
 if not found then raise exception 'This member is not available for linking' using errcode='22023';end if;
 perform 1 from managed_creators m join brands_v2 b on b.slug=m.brand and b.tenant_id=m.tenant_id where b.id=run.brand_id and m.tenant_id=tenant and m.archived_at is null order by m.id for update of m;
 select m.* into target from managed_creators m join brands_v2 b on b.slug=m.brand and b.tenant_id=m.tenant_id where m.id=p_roster and m.tenant_id=tenant and b.id=run.brand_id and m.archived_at is null;
 if not found or target.creator_id is null or nullif(trim(target.discord_id),'') is not null or nullif(trim(target.discord_user_id),'') is not null then raise exception 'Choose a creator without an existing Discord identity' using errcode='22023';end if;
 select * into canonical from creators_v2 where id=target.creator_id and tenant_id=tenant for update;
 if not found or nullif(trim(canonical.discord_id),'') is not null then raise exception 'Creator identity already linked' using errcode='22023';end if;
 if exists(select 1 from creators_v2 where trim(discord_id)=p_discord and id<>target.creator_id) or exists(select 1 from managed_creators m where m.tenant_id=tenant and m.archived_at is null and m.creator_id is distinct from target.creator_id and p_discord in(trim(m.discord_id),trim(m.discord_user_id))) then raise exception 'Discord identity is already claimed; review the conflict' using errcode='22023';end if;
 insert into creator_role_sync_links(run_id,roster_id,discord_id,linked_by) values(p_run,p_roster,p_discord,p_actor);
 update creators_v2 set discord_id=p_discord where id=target.creator_id and tenant_id=tenant;
 update managed_creators set discord_user_id=p_discord,updated_by=(select email from user_profiles where user_id=p_actor),updated_at=now() where id=p_roster and tenant_id=tenant;
 update creator_role_sync_members set roster_id=p_roster,creator_id=target.creator_id,creator_name=target.real_name,state='matched',identity_claims=array[p_discord],already_tagged=coalesce(target.tags @> array['elite'],false) where run_id=p_run and discord_id=p_discord;
end $$;

create function public.save_creator_cohort_config(p_actor uuid,p_brand uuid,p_guild text,p_role text,p_role_name text) returns void language plpgsql security invoker set search_path=public as $$
declare tenant uuid; current_guild text;
begin
 tenant:=authorize_creator_cohort_actor(p_actor,p_brand);
 select discord_guild_id into current_guild from brands_v2 where id=p_brand for update;
 if current_guild is not null and current_guild<>p_guild then raise exception 'Saved server differs; update brand setup first' using errcode='22023';end if;
 if exists(select 1 from brands_v2 where discord_guild_id=p_guild and id<>p_brand) then raise exception 'Server is already assigned' using errcode='22023';end if;
 insert into creator_role_sync_configs(brand_id,tenant_id,guild_id,role_id,role_name,updated_by) values(p_brand,tenant,p_guild,p_role,p_role_name,p_actor)
 on conflict(brand_id) do update set guild_id=excluded.guild_id,role_id=excluded.role_id,role_name=excluded.role_name,revision=creator_role_sync_configs.revision+1,updated_by=p_actor,updated_at=now();
 update brands_v2 set discord_guild_id=p_guild where id=p_brand and tenant_id=tenant;
end $$;

create function public.stage_creator_cohort_scan(p_actor uuid,p_brand uuid,p_revision integer,p_scanned integer,p_missing integer,p_members jsonb,p_retained jsonb) returns uuid language plpgsql security invoker set search_path=public as $$
declare tenant uuid; config public.creator_role_sync_configs%rowtype; run_id uuid;
begin
 tenant:=authorize_creator_cohort_actor(p_actor,p_brand);
 select * into config from creator_role_sync_configs where brand_id=p_brand and tenant_id=tenant and revision=p_revision for share;
 if not found then raise exception 'Configuration changed; check Discord again' using errcode='40001';end if;
 if jsonb_typeof(p_members)<>'array' or jsonb_array_length(p_members)>1000 or jsonb_typeof(p_retained)<>'array' or p_scanned<0 then raise exception 'Invalid inventory';end if;
 insert into creator_role_sync_runs(brand_id,tenant_id,actor_id,config_revision,guild_id,role_id,scanned,retained,missing_identities) values(p_brand,tenant,p_actor,config.revision,config.guild_id,config.role_id,p_scanned,p_retained,p_missing) returning id into run_id;
 insert into creator_role_sync_members(run_id,discord_id,display_name,roster_id,creator_id,creator_name,state,identity_claims,already_tagged)
 select run_id,x->>'discordId',left(x->>'name',200),(x->>'rosterId')::integer,(x->>'creatorId')::uuid,x->>'creatorName',x->>'state',array(select jsonb_array_elements_text(x->'identityClaims')),coalesce((x->>'alreadyTagged')::boolean,false) from jsonb_array_elements(p_members) x;
 return run_id;
end $$;

create function public.apply_creator_cohort_scan(p_actor uuid,p_run uuid) returns integer language plpgsql security invoker set search_path=public as $$
declare run public.creator_role_sync_runs%rowtype; tenant uuid; config public.creator_role_sync_configs%rowtype; member record; row public.managed_creators%rowtype; canonical text; claims text[]; after_tags text[]; changes integer:=0; actor_email text;
begin
 select * into run from creator_role_sync_runs where id=p_run for update;
 if not found or run.actor_id<>p_actor then raise exception 'Scan not in access' using errcode='42501';end if;
 tenant:=authorize_creator_cohort_actor(p_actor,run.brand_id);
 if tenant<>run.tenant_id then raise exception 'Scan not in tenant' using errcode='42501';end if;
 if run.applied_at is not null then return (select count(*)::integer from creator_role_sync_changes where run_id=p_run);end if;
 select * into config from creator_role_sync_configs where brand_id=run.brand_id and tenant_id=tenant and revision=run.config_revision for share;
 if not found or config.guild_id<>run.guild_id or config.role_id<>run.role_id or run.checked_at<now()-interval '15 minutes' then raise exception 'Scan expired or configuration changed; check Discord again' using errcode='40001';end if;
 -- Lock the brand roster and canonical IDs while checking duplicate claims.
 perform 1 from managed_creators m join brands_v2 b on b.slug=m.brand and b.tenant_id=m.tenant_id where b.id=run.brand_id and m.tenant_id=tenant and m.archived_at is null order by m.id for update of m;
 perform 1 from creators_v2 c where c.tenant_id=tenant and c.id in(select creator_id from managed_creators where tenant_id=tenant and brand=(select slug from brands_v2 where id=run.brand_id) and archived_at is null) order by c.id for share;
 select email into actor_email from user_profiles where user_id=p_actor;
 for member in select * from creator_role_sync_members where run_id=p_run and state='matched' order by roster_id loop
  select m.* into row from managed_creators m join brands_v2 b on b.slug=m.brand and b.tenant_id=m.tenant_id where m.id=member.roster_id and b.id=run.brand_id and m.tenant_id=tenant and m.archived_at is null;
  if not found or row.creator_id is null or row.creator_id is distinct from member.creator_id then raise exception 'Roster changed; check Discord again' using errcode='40001';end if;
  select discord_id into canonical from creators_v2 where id=row.creator_id and tenant_id=tenant;
  if not found then raise exception 'Creator identity changed; check Discord again' using errcode='40001';end if;
  select array_agg(distinct trim(v) order by trim(v)) into claims from unnest(array[row.discord_id,row.discord_user_id,canonical]) v where nullif(trim(v),'') is not null;
  if claims is distinct from member.identity_claims or cardinality(claims)<>1 or claims[1]<>member.discord_id then raise exception 'Identity changed; check Discord again' using errcode='40001';end if;
  if exists(select 1 from managed_creators m left join creators_v2 c on c.id=m.creator_id and c.tenant_id=m.tenant_id where m.tenant_id=tenant and m.brand=row.brand and m.archived_at is null and m.id<>row.id and member.discord_id in(trim(m.discord_id),trim(m.discord_user_id),trim(c.discord_id))) then raise exception 'Duplicate Discord identity; check Discord again' using errcode='40001';end if;
  select coalesce(array_agg(t),'{}') into after_tags from unnest(coalesce(row.tags,'{}')) t where lower(trim(t))<>'elite';
  after_tags:=array_append(after_tags,'elite');
  if cardinality(after_tags)>30 then raise exception 'Creator has too many tags; resolve before importing' using errcode='22023';end if;
  if after_tags is distinct from row.tags then
   insert into creator_role_sync_changes(run_id,roster_id,before_tags,after_tags,changed_by) values(p_run,row.id,row.tags,after_tags,p_actor);
   update managed_creators set tags=after_tags,updated_by=actor_email,updated_at=now() where id=row.id and tenant_id=tenant;
   changes:=changes+1;
  end if;
 end loop;
 update creator_role_sync_runs set applied_at=now() where id=p_run;
 return changes;
end $$;
revoke all on function public.authorize_creator_cohort_actor(uuid,uuid),public.save_creator_cohort_config(uuid,uuid,text,text,text),public.stage_creator_cohort_scan(uuid,uuid,integer,integer,integer,jsonb,jsonb),public.apply_creator_cohort_scan(uuid,uuid),public.link_creator_cohort_member(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.authorize_creator_cohort_actor(uuid,uuid),public.save_creator_cohort_config(uuid,uuid,text,text,text),public.stage_creator_cohort_scan(uuid,uuid,integer,integer,integer,jsonb,jsonb),public.apply_creator_cohort_scan(uuid,uuid),public.link_creator_cohort_member(uuid,uuid,text,integer) to service_role;
