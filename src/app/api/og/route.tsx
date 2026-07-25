import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

// nodejs, not edge: the vendored font files resolve through the standard
// `new URL(..., import.meta.url)` asset pattern, which Next bundles.
export const runtime = 'nodejs';

/**
 * Open Graph card — what every platform renders when a Tempo link is shared.
 *
 * Two variants:
 *   default   the product card (app + marketing links)
 *   connect   what a BRAND OWNER sees when an operator sends them a
 *             /connect/tiktok/<token> authorization link. That reader is a
 *             merchant deciding whether a link in their inbox is safe to open,
 *             so it says what will happen instead of selling anything.
 *
 * The previous card set `fontFamily: 'sans-serif'`, which Satori resolves to a
 * generic fallback face — that alone is why it read as cheap, before any
 * layout question. Inter is vendored beside this route (latin subset, ~31KB
 * per weight) rather than fetched at render time, so the card cannot silently
 * degrade to the fallback if a CDN is slow or blocked.
 */
const INTER = {
  regular: new URL('./fonts/Inter-400.woff', import.meta.url),
  semibold: new URL('./fonts/Inter-600.woff', import.meta.url),
  extrabold: new URL('./fonts/Inter-800.woff', import.meta.url),
};

const INK = '#F4F5FF';
const INK_DIM = '#A5ABCC';
const GROUND = '#0B0D1A';
const INDIGO = '#6366F1';
const VIOLET = '#A78BFA';

/**
 * A metric strip, not decoration. Tempo is a data product, so the card carries
 * the shape of data rather than an abstract gradient blob. Fixed heights —
 * Satori has no randomness — reading as a plausible GMV curve.
 */
const BARS = [20, 31, 26, 43, 38, 55, 48, 67, 60, 79, 72, 94];

async function loadFonts() {
  const [regular, semibold, extrabold] = await Promise.all([
    fetch(INTER.regular).then((r) => r.arrayBuffer()),
    fetch(INTER.semibold).then((r) => r.arrayBuffer()),
    fetch(INTER.extrabold).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: semibold, weight: 600 as const, style: 'normal' as const },
    { name: 'Inter', data: extrabold, weight: 800 as const, style: 'normal' as const },
  ];
}

export async function GET(request: NextRequest) {
  const variant = request.nextUrl.searchParams.get('v') === 'connect' ? 'connect' : 'default';

  const copy =
    variant === 'connect'
      ? {
          eyebrow: 'Shop authorization',
          headline: 'Connect your TikTok Shop.',
          sub: 'Authorize your agency to sync the performance data they already report on — no posting, no listings, no storefront changes.',
          badge: 'Performance data only',
        }
      : {
          eyebrow: 'Creator management for TikTok Shop',
          headline: 'Every creator. Every dollar. One place.',
          sub: 'GMV and commission per creator, post-level performance, retainers and invoicing — built for agencies running managed creator programs.',
          badge: 'tempoapp.ai',
        };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: GROUND,
          // Restrained depth: one indigo bloom off the top-left, a violet
          // counterweight bottom-right. Enough to avoid a flat rectangle,
          // well short of the purple-gradient-hero cliche.
          backgroundImage:
            'radial-gradient(900px circle at 6% -12%, rgba(99,102,241,0.30) 0%, transparent 58%),' +
            'radial-gradient(720px circle at 110% 120%, rgba(167,139,250,0.20) 0%, transparent 58%)',
          padding: '60px 72px',
          fontFamily: 'Inter',
        }}
      >
        {/* Wordmark + context label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: INK,
              }}
            >
              Tempo
            </div>
            <div
              style={{
                display: 'flex',
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${VIOLET})`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid white',
                  borderTop: '5.5px solid transparent',
                  borderBottom: '5.5px solid transparent',
                  marginLeft: 3,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: INK_DIM,
            }}
          >
            {copy.eyebrow}
          </div>
        </div>

        {/* The one idea, sized to survive a thumbnail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              fontSize: variant === 'connect' ? 88 : 76,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.03,
              color: INK,
              maxWidth: 950,
            }}
          >
            {copy.headline}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              lineHeight: 1.42,
              color: INK_DIM,
              maxWidth: 830,
            }}
          >
            {copy.sub}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '11px 20px',
              border: '1px solid rgba(255,255,255,0.14)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: 999,
              color: INK,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${VIOLET})`,
              }}
            />
            <div style={{ display: 'flex' }}>{copy.badge}</div>
          </div>

          {/* Older bars recede, so the eye travels left-to-right into the
              present — the way the product's own charts read. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 94 }}>
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 13,
                  height: h,
                  borderRadius: 3,
                  backgroundImage: `linear-gradient(180deg, ${VIOLET}, ${INDIGO})`,
                  opacity: 0.26 + (i / (BARS.length - 1)) * 0.74,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await loadFonts() },
  );
}
