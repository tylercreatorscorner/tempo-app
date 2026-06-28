-- Case-insensitive TikTok handle resolution.
--
-- Handle resolution (e.g. fetchHandleToRealName's .in('tiktok_username', ...))
-- matches the stats tables' handles against tiktok_accounts case-SENSITIVELY.
-- The stats tables (creator_performance, daily_creator_stats,
-- daily_video_product_stats) are already 100% lowercase, but tiktok_accounts
-- had 20 legacy rows with mixed-case tiktok_username (added before the app
-- started lowercasing on write). Those mixed-case accounts silently failed to
-- resolve as managed — 5 creators affected (no real name, excluded from
-- managed-share / ROI).
--
-- TikTok handles are case-insensitive (@JohnDoe === @johndoe), so normalizing
-- to lowercase is correct, not lossy.

-- 1. Backfill existing rows to lowercase. Verified collision-free against both
--    unique constraints (tenant_id,tiktok_username,brand_id) and the null-brand
--    (creator_id, lower(tiktok_username)) index.
update public.tiktok_accounts
set tiktok_username = lower(tiktok_username)
where tiktok_username <> lower(tiktok_username);

-- 2. Guarantee lowercase on every future write — bulletproof regardless of
--    which app path or worktree inserts/updates the row.
create or replace function public.tiktok_accounts_lower_username()
returns trigger language plpgsql as $$
begin
  if new.tiktok_username is not null then
    new.tiktok_username := lower(new.tiktok_username);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tiktok_accounts_lower_username on public.tiktok_accounts;
create trigger trg_tiktok_accounts_lower_username
  before insert or update on public.tiktok_accounts
  for each row execute function public.tiktok_accounts_lower_username();
