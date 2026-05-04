import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0D0E1F',
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,77,141,0.18) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(124,92,252,0.18) 0%, transparent 55%)',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: '#FFFFFF',
              display: 'flex',
            }}
          >
            Temp
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundImage: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '11px solid white',
                borderTop: '7px solid transparent',
                borderBottom: '7px solid transparent',
                marginLeft: 4,
              }}
            />
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            gap: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 84,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              color: '#FFFFFF',
              maxWidth: 980,
            }}
          >
            Run your TikTok Shop creator program like a $10M brand.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#9CA3AF',
              maxWidth: 900,
            }}
          >
            Real-time GMV tracking, creator rankings, and Discord-native communication.
          </div>
        </div>

        {/* Footer pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 32,
            padding: '12px 20px',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 999,
            alignSelf: 'flex-start',
            color: '#D1D5DB',
            fontSize: 22,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#FF4D8D',
            }}
          />
          <div style={{ display: 'flex' }}>tempoapp.ai</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
