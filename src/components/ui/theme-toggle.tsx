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
  sm: { track: 'h-6 w-11', width: 44, knob: 20, icon: 12 },
  md: { track: 'h-7 w-14', width: 56, knob: 24, icon: 14 },
} as const;

const PAD = 2; // p-0.5

/**
 * Animated light/dark toggle — a pill switch whose knob slides sun → moon with a
 * spring settle while the track fades day → night, AND fires the app's
 * circular-reveal View Transition (the `tempo-theme-reveal` keyframes in
 * globals.css) so the whole page wipes in from the click point.
 *
 * Self-driving off next-themes (no checked/onChange props) so both the admin and
 * creator shells just drop `<ThemeToggle />` in — one component, no drift. Leave
 * the generic ui/switch.tsx alone; this owns all theme concerns.
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
    // Reveal grows from the click point (consumed by ::view-transition-new(root)).
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
        'relative shrink-0 rounded-full p-0.5 transition-[background] duration-[400ms] ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        s.track,
        className,
      )}
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #232849, #0D0E20)'
          : 'linear-gradient(135deg, #7EC8FF, #BFE7FF)',
      }}
    >
      {/* Stars — fade in only in dark. */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span
          className="absolute h-[2px] w-[2px] rounded-full bg-white transition-opacity duration-500"
          style={{ top: '30%', left: '22%', opacity: isDark ? 0.9 : 0 }}
        />
        <span
          className="absolute h-[2px] w-[2px] rounded-full bg-white transition-opacity duration-700"
          style={{ top: '60%', left: '33%', opacity: isDark ? 0.7 : 0 }}
        />
        <span
          className="absolute h-[1.5px] w-[1.5px] rounded-full bg-white transition-opacity duration-500"
          style={{ top: '24%', left: '40%', opacity: isDark ? 0.55 : 0 }}
        />
      </span>

      {/* Knob — slides with a spring settle; sun/moon crossfade + rotate inside. */}
      <span
        className="relative z-10 grid place-items-center rounded-full"
        style={{
          height: s.knob,
          width: s.knob,
          transform: `translateX(${isDark ? travel : 0}px)`,
          transition:
            'transform 400ms cubic-bezier(0.34,1.56,0.64,1), background 400ms ease, box-shadow 400ms ease',
          background: isDark ? '#E8ECF5' : '#FFD65C',
          boxShadow: isDark
            ? '0 1px 3px rgba(0,0,0,0.45)'
            : '0 0 8px rgba(255,214,92,0.7), 0 1px 2px rgba(0,0,0,0.2)',
        }}
      >
        <Sun
          className="absolute transition-all duration-[400ms]"
          strokeWidth={2.5}
          style={{
            height: s.icon,
            width: s.icon,
            color: '#B25E00',
            opacity: isDark ? 0 : 1,
            transform: isDark ? 'rotate(90deg) scale(0.5)' : 'rotate(0deg) scale(1)',
          }}
        />
        <Moon
          className="absolute transition-all duration-[400ms]"
          strokeWidth={2.5}
          style={{
            height: s.icon,
            width: s.icon,
            color: '#232849',
            opacity: isDark ? 1 : 0,
            transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
          }}
        />
      </span>
    </button>
  );
}
