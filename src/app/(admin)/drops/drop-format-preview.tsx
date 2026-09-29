import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DROP_FORMATS, type DropFormatId } from '@/lib/data/drop-formats';
import { renderDiscordMarkdown } from '../reporting/message-preview';

// Illustrative copy only. These examples never request data or enter the build/copy flow.
const EXAMPLES: Record<DropFormatId, string> = {
  movers: '# 📈 BIGGEST MOVERS — {BRAND}\n_Ranked by growth, not total, over {WINDOW}._\n\n**1.** @creator_a — **+84%** ($450 → **$828**, +$378)\n**2.** @creator_b — **+41%** ($620 → **$874**, +$254)\n\n_6 creators grew this period out of 24 selling._',
  rookies: '# 🌱 ROOKIE WATCH — {BRAND}\n_First sales from creators in their opening weeks._\n\n**1.** @new_creator — **$192** during {WINDOW} · day 4\n**2.** @fresh_face — **$86** during {WINDOW} · day 9\n\n_2 creators made their first sale. Say hi!_',
  milestones: '# 🏆 MILESTONES — {BRAND}\n_Crossed in the last 14 days._\n\n🎉 @creator_a just crossed **$10,000** in lifetime GMV\n⭐ @creator_b just crossed **$25,000** in lifetime GMV\n\n_Celebrate the progress and keep the momentum going._',
  mtd: '# 🗓️ MONTH-TO-DATE LEADERBOARD — {BRAND}\n_Day 18 of 30 · 60% through the month_\n\n**$42,800** so far · up 16% vs the same point last month\n\n**1.** @creator_a · **$8,420** · up 2 places\n**2.** @creator_b · **$6,140** · holding steady\n**3.** @creator_c · **$4,890** · new to the top three',
  'whats-cooking': '🍳 **What\'s Cooking?** | {BRAND} | {WINDOW}\n*Top-performing videos from this window*\n\n📊 **$18,400** GMV from **42** videos and **18** creators\n\n**HOT VIDEOS (posted last 7 days)**\n> 1. @creator_a — **$2,140** GMV\n> 2. @creator_b — **$1,760** GMV\n\n**RISING (posted 7–14 days ago)**\n> 1. @creator_c — **$1,120** GMV',
  'whos-cooking': '👨‍🍳 **WHO\'S COOKING** · {BRAND} · {WINDOW}\n*The highlight reel*\n\n> 1. @creator_a · **$8,420** · up 2 places\n> 2. @creator_b · **$6,140** · holding steady\n> 3. @creator_c · **$4,890** · new this week\n\n💰 Total creator GMV: **$32,500** across **24** creators',
  'daily-drop': '# 📈 DAILY DROP | {BRAND} | YESTERDAY\n\n💰 YESTERDAY\'S GMV: **$3,840** · up 12% from the prior day\n\n**TOP 3 CREATORS**\n> 1. @creator_a · **$940**\n> 2. @creator_b · **$720**\n> 3. @creator_c · **$510**\n\n**TOP VIDEO**\n> @creator_a · **$380** GMV',
};

export function DropFormatPreview({
  id, brandName, windowLabel, selected,
}: {
  id: DropFormatId;
  brandName: string;
  windowLabel: string;
  selected: boolean;
}) {
  const format = DROP_FORMATS.find(item => item.id === id)!;
  const example = EXAMPLES[id]
    .replaceAll('{BRAND}', brandName.toUpperCase())
    .replaceAll('{WINDOW}', windowLabel);

  return <aside aria-label={`${format.label} sample preview`} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:sticky lg:top-4 lg:self-start">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Sparkles size={13} aria-hidden="true" /> Format preview</div>
        <h3 className="mt-1 text-base font-semibold text-foreground">{format.label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{format.what}</p>
      </div>
      <Badge variant={selected ? 'positive' : 'neutral'} size="sm">{selected ? 'In your build' : 'Not selected'}</Badge>
    </div>
    <div className="flex items-center justify-between gap-2 bg-[#2b2d31] px-4 py-2 text-xs text-[#b5bac1]">
      <span># creator-highlights</span>
      <span className="rounded bg-[#3f4147] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Example</span>
    </div>
    <div className="max-h-[330px] overflow-auto bg-[#313338] px-4 py-4 text-[#dbdee1]">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#5865f2] text-white"><Sparkles size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs font-semibold text-white">Tempo <span className="ml-1 rounded bg-[#5865f2] px-1 py-0.5 text-[9px] uppercase">Bot</span> <span className="ml-1 font-normal text-[#949ba4]">Sample</span></div>
          <div className="whitespace-pre-wrap break-words text-xs leading-5">{renderDiscordMarkdown(example)}</div>
        </div>
      </div>
    </div>
    <div className="border-t border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
      Sample names and figures show the layout only. Build selected to generate real posts for review and copying.
      {!format.acceptsWindow && <span className="mt-1 block font-medium text-foreground">This format uses {format.ownWindowLabel?.toLowerCase()} instead of the selected window.</span>}
    </div>
  </aside>;
}
