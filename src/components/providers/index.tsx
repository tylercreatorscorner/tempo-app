'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { PostHogProvider } from './posthog-provider';
import { LenisProvider } from './lenis-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <PostHogProvider>
        <LenisProvider>{children}</LenisProvider>
      </PostHogProvider>
    </ThemeProvider>
  );
}
