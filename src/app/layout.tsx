import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.tempoapp.ai';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tempo | Creator Management for TikTok Shop',
    template: '%s | Tempo',
  },
  description:
    'Tempo is the creator management platform for TikTok Shop. Real-time GMV tracking, creator rankings, and Discord-native communication — all in one place.',
  keywords: [
    'TikTok Shop',
    'creator management',
    'affiliate marketing',
    'GMV tracking',
    'Discord bot',
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
      'Real-time GMV tracking, creator rankings, and Discord-native communication for TikTok Shop brands.',
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
      'Real-time GMV tracking, creator rankings, and Discord-native communication for TikTok Shop brands.',
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
