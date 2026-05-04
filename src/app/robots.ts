import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.tempoapp.ai';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/admin', '/brand-dashboard', '/creator-dashboard', '/onboarding'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
