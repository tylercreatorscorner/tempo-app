import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/components/providers';
import './globals.css';

// Variable font, not five static cuts.
//
// Google publishes Inter as a variable font and serves the same files either
// way, so pinning five static weights bought nothing and broke the build on
// 2026-08-10: Google rotated the Inter v20 file hashes (UcCB3… → UcC73…),
// Vercel restored a build cache holding the old CSS, and every @font-face src
// 404'd — seven module-not-found errors and two failed production deploys
// that had nothing to do with the commits in them. Omitting `weight` takes the
// single variable file, which covers 100–900 including the 500/600 this UI
// leans on.
//
// The underlying fragility is unchanged: next/font/google is a build-time
// network dependency on fonts.gstatic.com. Self-hosting the woff2 via
// next/font/local is the real fix and needs the files committed.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.tempoapp.ai';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tempo | Creator Management for TikTok Shop',
    template: '%s | Tempo',
  },
  description:
    'Tempo is the creator management platform for TikTok Shop. GMV and commission per creator, post-level performance, retainers and invoicing — built for agencies running managed creator programs.',
  keywords: [
    'TikTok Shop',
    'creator management',
    'affiliate marketing',
    'GMV tracking',
    'creator commission tracking',
    'TikTok Shop analytics',
    'creator program',
  ],
  authors: [{ name: 'Tempo' }],
  creator: 'Tempo',
  publisher: 'Tempo',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Tempo',
    title: 'Tempo | Creator Management for TikTok Shop',
    description:
      'GMV and commission per creator, post-level performance, retainers and invoicing — for agencies running managed creator programs.',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Tempo — Creator Management for TikTok Shop',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tempo | Creator Management for TikTok Shop',
    description:
      'GMV and commission per creator, post-level performance, retainers and invoicing — for agencies running managed creator programs.',
    images: ['/api/og'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FF4D8D' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0E1F' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased`}
        style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      >
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
