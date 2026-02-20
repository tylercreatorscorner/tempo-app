import { getBrandSummary, getCreatorRankings, getProductSummary } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { generateTopCreatorsPost, generateTrendingProductsPost, generateWeeklyRecapPost } from '@/lib/discord/generators';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { format } from 'date-fns';
import { DiscordPostsClient } from './client';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function DiscordPostsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);
  const selectedBrand = params.brand || null;
  const dateLabel = `${format(new Date(startDate), 'MMM d')}–${format(new Date(endDate), 'MMM d, yyyy')}`;

  // Fetch data for all brands or selected brand
  const brandsToFetch = selectedBrand ? [selectedBrand] : [...BRANDS];

  const [allCreators, allProducts, brandSummaries] = await Promise.all([
    Promise.all(
      brandsToFetch.map(async (brand) => {
        try { return await getCreatorRankings(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)),
    Promise.all(
      brandsToFetch.map(async (brand) => {
        try { return await getProductSummary(brand, startDate, endDate, 20); } catch { return []; }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)).slice(0, 20)),
    Promise.all(
      brandsToFetch.map(async (brand) => {
        try {
          const data = await getBrandSummary(brand, startDate, endDate);
          return { brand, data: data[0] ?? null };
        } catch { return { brand, data: null }; }
      })
    ),
  ]);

  // Generate all post types
  const topCreatorsPost = generateTopCreatorsPost(allCreators, selectedBrand, dateLabel);
  const trendingProductsPost = generateTrendingProductsPost(allProducts, selectedBrand, dateLabel);

  // Weekly recaps per brand
  const weeklyRecaps: { brand: string; brandName: string; content: string }[] = [];
  for (const bs of brandSummaries) {
    const brandCreators = allCreators.filter(() => true); // already filtered if single brand
    const brandProducts = allProducts.filter(() => true);
    // For per-brand recap, fetch specifically if all brands mode
    if (!selectedBrand) {
      try {
        const creators = await getCreatorRankings(bs.brand, startDate, endDate, 5);
        const products = await getProductSummary(bs.brand, startDate, endDate, 5);
        weeklyRecaps.push({
          brand: bs.brand,
          brandName: BRAND_DISPLAY_NAMES[bs.brand] ?? bs.brand,
          content: generateWeeklyRecapPost(bs.brand, bs.data, creators, products, dateLabel),
        });
      } catch {
        weeklyRecaps.push({
          brand: bs.brand,
          brandName: BRAND_DISPLAY_NAMES[bs.brand] ?? bs.brand,
          content: generateWeeklyRecapPost(bs.brand, bs.data, [], [], dateLabel),
        });
      }
    } else {
      weeklyRecaps.push({
        brand: bs.brand,
        brandName: BRAND_DISPLAY_NAMES[bs.brand] ?? bs.brand,
        content: generateWeeklyRecapPost(bs.brand, bs.data, allCreators, allProducts, dateLabel),
      });
    }
  }

  const posts = [
    { id: 'top-creators', title: '🏆 Top Creators This Week', content: topCreatorsPost },
    { id: 'trending-products', title: '🔥 Trending Products', content: trendingProductsPost },
    ...weeklyRecaps.map((r) => ({
      id: `recap-${r.brand}`,
      title: `📊 Weekly Recap — ${r.brandName}`,
      content: r.content,
    })),
  ];

  const brandOptions = BRANDS.map((b) => ({ value: b, label: BRAND_DISPLAY_NAMES[b] ?? b }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          Discord Post Generator
        </h1>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Auto-generate formatted Discord messages for your creator community
        </p>
      </div>

      <DiscordPostsClient
        posts={posts}
        brandOptions={brandOptions}
        currentBrand={selectedBrand}
        currentRange={params.range || 'last7'}
      />
    </div>
  );
}
