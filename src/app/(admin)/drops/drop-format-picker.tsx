'use client';

import { Dialog } from 'radix-ui';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DROP_FORMATS, type DropFormatId } from '@/lib/data/drop-formats';

const GROUPS: { title: string; ids: DropFormatId[] }[] = [
  { title: 'Growth & discovery', ids: ['movers', 'rookies', 'milestones', 'mtd'] },
  { title: 'Content & daily activity', ids: ['whats-cooking', 'whos-cooking', 'daily-drop'] },
];
const MINIATURES: Record<DropFormatId, { heading: string; lines: string[] }> = {
  movers: { heading: 'Biggest movers', lines: ['01  @creator  +84%', '02  @creator  +41%'] },
  rookies: { heading: 'Rookie watch', lines: ['First sales this week', '01  @new_creator  $192'] },
  milestones: { heading: 'Milestones', lines: ['@creator reached $10k', '@creator reached $25k'] },
  mtd: { heading: 'Month to date', lines: ['$42.8k so far  ↑ 16%', '01  @creator  $8.4k'] },
  'whats-cooking': { heading: "What's cooking", lines: ['Top videos this week', '01  Video by @creator  $2.1k'] },
  'whos-cooking': { heading: "Who's cooking", lines: ['Creator highlights', '01  @creator  $8.4k'] },
  'daily-drop': { heading: 'Daily drop', lines: ['Yesterday  $3.8k', 'Top creator  @creator'] },
};

function FormatArtwork({ id }: { id: DropFormatId }) {
  const example = MINIATURES[id];
  return (
    <div aria-hidden="true" className="h-24 overflow-hidden rounded-xl border border-[#41434b] bg-[#313338] p-3 text-[#dbdee1]">
      <div className="mb-1.5 flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-[4px] bg-[#5865f2] text-[9px] font-bold text-white">T</span><span className="text-[10px] font-semibold text-white">Tempo Bot</span><span className="rounded-sm bg-[#5865f2] px-1 text-[8px] font-semibold text-white">BOT</span></div>
      <p className="truncate text-[11px] font-bold leading-4 text-white">{example.heading}</p>
      {example.lines.map(line => <p key={line} className="truncate text-[10px] leading-4 text-[#b5bac1]">{line}</p>)}
    </div>
  );
}

export function DropFormatPicker({ selected, onChange, disabled }: {
  selected: DropFormatId[];
  onChange: (ids: DropFormatId[]) => void;
  disabled: boolean;
}) {
  const toggle = (id: DropFormatId) => onChange(selected.includes(id)
    ? selected.filter(value => value !== id)
    : DROP_FORMATS.filter(format => selected.includes(format.id) || format.id === id).map(format => format.id));

  return <Dialog.Root>
    <Dialog.Trigger asChild><Button variant="outline" size="sm" disabled={disabled}>Customize build</Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]" />
      <Dialog.Content data-lenis-prevent className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-8 lg:inset-x-[max(3rem,calc((100vw-1100px)/2))] lg:inset-y-8">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
          <div><Dialog.Title className="text-lg font-bold tracking-tight text-foreground">Discord post formats</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Choose the posts to build. {selected.length} of {DROP_FORMATS.length} selected. Your choices are saved in this browser.</Dialog.Description></div>
          <div className="flex items-center gap-2"><Dialog.Close asChild><Button size="sm">Done</Button></Dialog.Close><Dialog.Close aria-label="Close" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={17}/></Dialog.Close></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-secondary/25 px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Illustrations show the layout, not live data. Build selected to generate copy-ready posts.</p>
            <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => onChange(DROP_FORMATS.map(format => format.id))}>Select all</Button><Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear</Button></div>
          </div>
          {GROUPS.map(group => <section key={group.title} className="mb-8 last:mb-0">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.title}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.ids.map(id => {
                const format = DROP_FORMATS.find(item => item.id === id)!;
                const added = selected.includes(id);
                return <article key={id} className={cn('flex min-h-[224px] flex-col rounded-xl border bg-card p-3.5 transition-colors', added ? 'border-primary/35' : 'border-border hover:border-primary/40')}>
                  <FormatArtwork id={id}/>
                  <div className="flex-1 pt-3"><h4 className="text-[13px] font-semibold text-foreground">{format.label}</h4><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{format.what}</p>{!format.acceptsWindow && <p className="mt-1 text-[11px] text-muted-foreground">Window: {format.ownWindowLabel}</p>}</div>
                  <button type="button" aria-pressed={added} onClick={() => toggle(id)} className={cn('mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', added ? 'border-border bg-card text-foreground hover:bg-secondary' : 'border-foreground bg-foreground text-background hover:opacity-85')}>
                    {added ? <><Check size={14}/>Added</> : <><Plus size={14}/>Add</>}
                  </button>
                </article>;
              })}
            </div>
          </section>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
