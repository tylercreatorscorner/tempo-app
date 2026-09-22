import { opsContext } from '@/lib/community-ops/server';
import { avatarIdentity } from '@/lib/community-ops/avatar-identity';
import { pilotGuilds } from '@/lib/community-ops/model';

const unavailable = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  try {
    const ctx = await opsContext();
    if (ctx.denied) return ctx.denied;
    const params=new URL(request.url).searchParams;
    const channel = params.get('channel');
    const author=params.get('author');
    if(author&&!/^\d{17,20}$/.test(author))return unavailable();
    if (!channel || !/^\d{17,20}$/.test(channel)) return unavailable();
    const { data: ticket } = await ctx.db.from('community_ops_channels').select('guild_id,name,messages')
      .eq('tenant_id', ctx.scope.tenantId).eq('channel_id', channel).eq('kind', 'ticket').eq('enabled', true)
      .in('guild_id', Object.keys(pilotGuilds)).maybeSingle();
    if (!ticket) return unavailable();
    const { data: metric } = await ctx.db.from('community_ops_metrics').select('discord_id,snapshot')
      .eq('tenant_id', ctx.scope.tenantId).eq('guild_id', ticket.guild_id).eq('channel_id', channel).maybeSingle();
    const identity=avatarIdentity(ticket.name,ticket.messages??[],metric,author);
    if(!identity)return unavailable();
    const token = process.env.DISCORD_TICKET_BOT_TOKEN;
    if (!token) return unavailable();
    // Cache profile metadata, not authorization. Every request checks ticket access above.
    const response = await fetch(`https://discord.com/api/v10/users/${identity}`, {
      headers: { Authorization: `Bot ${token}` }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return unavailable();
    const user = await response.json();
    if(user.id!==identity)return unavailable();
    const avatar=typeof user.avatar==='string'&&/^(a_)?[a-f0-9]+$/.test(user.avatar)?`avatars/${user.id}/${user.avatar}.png?size=128`:`embed/avatars/${user.discriminator&&user.discriminator!=='0'?Number(user.discriminator)%5:Number((BigInt(identity)>>BigInt(22))%BigInt(6))}.png`;
    return new Response(null, { status: 302, headers: {
      Location: `https://cdn.discordapp.com/${avatar}`,
      'Cache-Control': 'private, max-age=300',
    } });
  } catch { return unavailable(); }
}
