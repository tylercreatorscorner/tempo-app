'use client';

import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { width: 44, height: 24, knob: 18, icon: 11 },
  md: { width: 50, height: 28, knob: 22, icon: 13 },
} as const;

const PAD = 3;

/**
 * Refined light/dark toggle — a compact pill whose knob slides sun ⇄ moon with a
 * gentle spring, over a muted track that fits the Pulse surfaces (no loud
 * day/night scene). Clicking also fires the app's circular-reveal View Transition
 * (the `tempo-theme-reveal` keyframes in globals.css) so the page wipes in from
 * the knob.
 *
 * Self-driving off next-themes (no props) so both the admin and creator shells
 * just drop `<ThemeToggle />` in — one component, no drift.
 */
export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const s = SIZES[size];
  const travel = s.width - s.knob - PAD * 2;

  const toggle = (e: React.MouseEvent) => {
    const next = isDark ? 'light' : 'dark';
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (
      typeof doc.startViewTransition !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setTheme(next);
      return;
    }
    document.documentElement.style.setProperty('--vt-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--vt-y', `${e.clientY}px`);
    doc.startViewTransition(() => flushSync(() => setTheme(next)));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={toggle}
      className={cn(
        'relative shrink-0 rounded-full border border-border transition-colors duration-300 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      style={{
        width: s.width,
        height: s.height,
        padding: PAD,
        background: isDark ? '#20233d' : '#ECEAF5',
      }}
    >
      <span
        className="grid place-items-center rounded-full"
        style={{
          height: s.knob,
          width: s.knob,
          transform: `translateX(${isDark ? travel : 0}px)`,
          transition: 'transform 380ms cubic-bezier(0.34,1.5,0.6,1)',
          background: isDark ? '#EEF1FA' : '#FFFFFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
        }}
      >
        <Sun
          className="absolute transition-all duration-300"
          strokeWidth={2.5}
          style={{
            height: s.icon,
            width: s.icon,
            color: '#F59E0B',
            opacity: isDark ? 0 : 1,
            transform: isDark ? 'rotate(-90deg) scale(0.4)' : 'rotate(0deg) scale(1)',
          }}
        />
        <Moon
          className="absolute transition-all duration-300"
          strokeWidth={2.5}
          style={{
            height: s.icon,
            width: s.icon,
            color: '#4F46E5',
            opacity: isDark ? 1 : 0,
            transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.4)',
          }}
        />
      </span>
    </button>
  );
}
