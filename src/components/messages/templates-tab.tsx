'use client';

/**
 * Templates tab — Phase A: read-only cards for the starter broadcast
 * templates. "Use" jumps to the Broadcasts tab with the template loaded in
 * the compose panel. CRUD arrives with the templates library (Phase B).
 */

import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BROADCAST_TEMPLATES } from './templates';
import { TokenText } from './comms-bits';
import { splitByTokens } from './templates';

export function TemplatesTab({ onUse }: { onUse: (key: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Starter templates with personalization tokens. Tokens resolve per creator at send time
        from the same rollups the roster uses. Editing and saving your own arrives in Phase B.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BROADCAST_TEMPLATES.map((t) => {
          const tokens = [...new Set(
            splitByTokens(t.body).filter((p) => p.type === 'token').map((p) => p.value),
          )];
          return (
            <Card key={t.key} className="flex flex-col overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h3 className="text-[13px] font-extrabold text-foreground">{t.name}</h3>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.description}</p>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex-1 rounded-lg border border-border bg-secondary/60 px-3.5 py-3">
                  <TokenText body={t.body} className="text-[12.5px] leading-relaxed text-foreground" />
                </div>
                {tokens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tokens.map((tok) => (
                      <span
                        key={tok}
                        className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground"
                      >
                        {tok}
                      </span>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="self-start" onClick={() => onUse(t.key)}>
                  Use template
                  <ArrowRight />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
