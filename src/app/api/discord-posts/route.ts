import { NextRequest, NextResponse } from 'next/server';
import {
  getWhatsCookingData,
  getWhosCookingData,
  formatWhatsCookingDiscord,
  formatWhosCookingDiscord,
} from '@/lib/data/discord-posts';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'whats-cooking';
  const brand = searchParams.get('brand') || 'all';
  const period = (searchParams.get('period') || '7d') as '7d' | '30d';

  const brandName = brand === 'all'
    ? 'All Brands'
    : BRAND_DISPLAY_NAMES[brand] || brand;

  try {
    if (type === 'whats-cooking') {
      const data = await getWhatsCookingData(brand, period);
      const text = formatWhatsCookingDiscord(data, brandName, period);
      return NextResponse.json({
        text,
        stats: {
          totalGmv: data.totalGmv,
          videoCount: data.videoCount,
          creatorCount: data.creatorCount,
        },
      });
    } else if (type === 'whos-cooking') {
      const data = await getWhosCookingData(brand, period);
      const text = formatWhosCookingDiscord(data, brandName, period);
      return NextResponse.json({
        text,
        stats: {
          totalGmv: data.totalGmv,
          videoCount: data.videoCount,
          creatorCount: data.creatorCount,
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Discord posts API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
