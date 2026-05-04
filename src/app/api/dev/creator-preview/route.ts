import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { setCreatorSession } from '@/lib/auth/creator-auth';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV !== 'production';

export async function GET(request: NextRequest) {
  if (!isDev) {
    return new NextResponse('Not found', { status: 404 });
  }

  const id = request.nextUrl.searchParams.get('id');
  const supabase = await createAdminClient();

  if (!id) {
    // Pull creators, their linked tiktok accounts, and recent data signals.
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [creatorsRes, accountsRes, statsRes] = await Promise.all([
      supabase
        .from('creators_v2')
        .select('id, real_name, email')
        .order('real_name', { ascending: true })
        .limit(2000),
      supabase
        .from('tiktok_accounts')
        .select('creator_id, tiktok_username, is_primary'),
      supabase
        .from('daily_creator_stats')
        .select('tiktok_username, gmv')
        .gte('report_date', sinceDate)
        .gt('gmv', 0)
        .limit(50000),
    ]);

    const creators = creatorsRes.data ?? [];
    const accounts = accountsRes.data ?? [];
    const stats = statsRes.data ?? [];

    // Aggregate recent GMV by tiktok username (last 30 days).
    const gmvByUsername = new Map<string, number>();
    for (const r of stats as { tiktok_username: string; gmv: number | null }[]) {
      const u = r.tiktok_username;
      if (!u) continue;
      gmvByUsername.set(u, (gmvByUsername.get(u) ?? 0) + (Number(r.gmv) || 0));
    }

    // Group accounts by creator_id, sorting primary first.
    const accountsByCreator = new Map<
      string,
      { username: string; isPrimary: boolean }[]
    >();
    for (const a of accounts as {
      creator_id: string;
      tiktok_username: string;
      is_primary: boolean | null;
    }[]) {
      if (!a.creator_id) continue;
      const arr = accountsByCreator.get(a.creator_id) ?? [];
      arr.push({ username: a.tiktok_username, isPrimary: !!a.is_primary });
      accountsByCreator.set(a.creator_id, arr);
    }
    for (const arr of accountsByCreator.values()) {
      arr.sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary));
    }

    type Row = {
      id: string;
      name: string;
      email: string;
      usernames: string[];
      recentGmv: number;
      hasData: boolean;
    };

    const rows: Row[] = creators.map(
      (c: { id: string; real_name: string | null; email: string | null }) => {
        const accts = accountsByCreator.get(c.id) ?? [];
        const usernames = accts.map((a) => a.username);
        const recentGmv = usernames.reduce(
          (sum, u) => sum + (gmvByUsername.get(u) ?? 0),
          0
        );
        return {
          id: c.id,
          name: c.real_name || '(no name)',
          email: c.email || '',
          usernames,
          recentGmv,
          hasData: recentGmv > 0,
        };
      }
    );

    // Sort: has-data DESC by recent GMV, then alpha by name.
    rows.sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      if (a.hasData && b.hasData) return b.recentGmv - a.recentGmv;
      return a.name.localeCompare(b.name);
    });

    const origin = request.nextUrl.origin;
    const escape = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
          c
        ] as string)
      );
    const fmtMoney = (n: number) =>
      n >= 1000
        ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
        : `$${Math.round(n)}`;

    const renderRow = (r: Row) => {
      const handles = r.usernames
        .slice(0, 3)
        .map((u) => `@${escape(u)}`)
        .join(' · ');
      const more =
        r.usernames.length > 3 ? ` <span class="more">+${r.usernames.length - 3}</span>` : '';
      const gmvBadge = r.hasData
        ? `<span class="gmv">${fmtMoney(r.recentGmv)} / 30d</span>`
        : '';
      return `<li data-search="${escape(
        (r.name + ' ' + r.email + ' ' + r.usernames.join(' ')).toLowerCase()
      )}">
        <a href="${origin}/api/dev/creator-preview?id=${encodeURIComponent(
        r.id
      )}">${escape(r.name)}</a>
        ${gmvBadge}
        <div class="meta"><span class="handles">${handles}${more}</span> <span class="email">${escape(
        r.email
      )}</span></div>
      </li>`;
    };

    const withData = rows.filter((r) => r.hasData);
    const withoutData = rows.filter((r) => !r.hasData);

    const html = `<!doctype html>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<title>Dev: pick a creator</title>
<style>
  html, body { background: #fff; }
  body { font: 14px system-ui, sans-serif; padding: 24px; max-width: 760px; margin: auto; color: #111; }
  h1 { margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 16px; }
  .search { width: 100%; padding: 10px 12px; font-size: 15px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 16px; box-sizing: border-box; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin: 24px 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 10px 12px; border-radius: 6px; margin-bottom: 4px; }
  li:hover { background: #f5f3ff; }
  li a { color: #6d28d9; text-decoration: none; font-weight: 600; font-size: 15px; }
  li a:hover { text-decoration: underline; }
  .gmv { display: inline-block; background: #ecfdf5; color: #059669; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
  .meta { font-size: 12px; color: #888; margin-top: 2px; }
  .handles { color: #444; }
  .email { margin-left: 8px; }
  .more { color: #aaa; }
  .empty { color: #aaa; padding: 8px 12px; }
</style>
<h1>Dev: preview creator portal as…</h1>
<p class="sub">Click a creator to mint a session cookie and jump into their portal. Dev only.</p>
<input class="search" placeholder="Search by name, email, or @handle…" autofocus />
<h2>With recent data (last 30 days) — ${withData.length}</h2>
<ul id="with-data">
${withData.map(renderRow).join('\n') || '<li class="empty">No creators with recent GMV.</li>'}
</ul>
<h2>No recent data — ${withoutData.length}</h2>
<ul id="no-data">
${withoutData.map(renderRow).join('\n')}
</ul>
<script>
  const input = document.querySelector('.search');
  const items = Array.from(document.querySelectorAll('li[data-search]'));
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    for (const li of items) {
      li.style.display = !q || li.dataset.search.includes(q) ? '' : 'none';
    }
  });
</script>`;

    return new NextResponse(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const { data: creator, error } = await supabase
    .from('creators_v2')
    .select('id, email')
    .eq('id', id)
    .single();

  if (error || !creator) {
    return new NextResponse(`Creator not found: ${id}`, { status: 404 });
  }

  await setCreatorSession({
    creatorId: creator.id as unknown as number,
    email: creator.email ?? '',
    tenantId: '',
  });

  // Marker cookie so getCreatorProfile() uses the admin client to bypass RLS
  // (the JWT verification is the actual authn — the lookup is just hydration).
  const cookieStore = await cookies();
  cookieStore.set('dev_creator_preview', '1', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return NextResponse.redirect(new URL('/creator-dashboard', request.url));
}
