'use client';

import { useState, useTransition } from 'react';
import { Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { generateAnalyticsNarrative, type NarrativeInput } from '@/lib/ai/analytics-narrative';

interface Props {
  /** Pre-built brief that the LLM uses to write the narrative. The page builds
   * this server-side from the same metrics it renders elsewhere. */
  input: NarrativeInput;
}

/** Click-to-generate narrative card. We deliberately don't auto-generate on
 * page load — every page render would rack up Anthropic API spend, and most
 * loads don't need a fresh narrative. The button-driven model keeps it
 * intentional: when an exec wants the story, they ask for it. */
export function NarrativeCard({ input }: Props) {
  const [text, setText]   = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateAnalyticsNarrative(input);
      if (result.ok) {
        setText(result.text);
      } else {
        setError(result.error);
        setText(null);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#FAF7FF] to-[#FFF5FB] border border-[var(--primary)]/15 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">Narrative</h3>
            <p className="text-[11px] text-muted-foreground">AI summary of what moved this period</p>
          </div>
        </div>
        {(text || error) && (
          <button
            onClick={generate}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-[var(--foreground)] hover:bg-card transition-colors disabled:opacity-50"
            aria-label="Regenerate narrative"
          >
            <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
        )}
      </div>

      {!text && !error && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Generate a 2-4 paragraph summary of what changed this period and what to do about it.
          </p>
          <button
            onClick={generate}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--foreground)] text-white text-sm font-semibold hover:bg-[#2D1B69] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Writing…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate narrative
              </>
            )}
          </button>
        </div>
      )}

      {text && (
        <div className="prose prose-sm max-w-none text-sm text-[var(--foreground)] leading-relaxed">
          {text.split('\n\n').map((para, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {/* Render **bold** inline */}
              {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                part.startsWith('**') && part.endsWith('**') ? (
                  <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </p>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-amber-500 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Couldn&apos;t generate narrative</p>
            <p className="text-xs text-amber-600 mt-0.5">{error}</p>
            {error.includes('ANTHROPIC_API_KEY') && (
              <p className="text-xs text-amber-600 mt-1">Set the env var to enable AI summaries.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
