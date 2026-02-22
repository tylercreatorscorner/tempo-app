import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import type { CreatorRanking, ProductSummary, BrandSummary } from '@/types/database';

function bn(brand: string) {
  return BRAND_DISPLAY_NAMES[brand] ?? brand;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function generateTopCreatorsPost(
  creators: CreatorRanking[],
  brandFilter: string | null,
  dateLabel: string,
): string {
  const top = creators.slice(0, 10);
  const header = brandFilter
    ? `🏆 **Top Creators This Week — ${bn(brandFilter)}**`
    : `🏆 **Top Creators This Week — All Brands**`;

  const lines = [
    header,
    `📅 ${dateLabel}`,
    '',
    ...top.map((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
      return `${medal} **@${c.creator_name}** - ${fmtCurrency(c.total_gmv)} GMV (${fmtNum(c.total_videos)} videos)`;
    }),
    '',
    `Total creators ranked: ${creators.length}`,
    '',
    '> Keep grinding! 💪 Top performers get featured in our next brand spotlight.',
  ];

  return lines.join('\n');
}

export function generateTrendingProductsPost(
  products: ProductSummary[],
  brandFilter: string | null,
  dateLabel: string,
): string {
  const top = products.slice(0, 10);
  const header = brandFilter
    ? `🔥 **Trending Products — ${bn(brandFilter)}**`
    : `🔥 **Trending Products — All Brands**`;

  const lines = [
    header,
    `📅 ${dateLabel}`,
    '',
    ...top.map((p, i) => {
      const name = p.product_name.length > 50 ? p.product_name.slice(0, 47) + '...' : p.product_name;
      return `**${i + 1}.** ${name} — ${fmtCurrency(p.total_gmv)} (${fmtNum(p.total_orders)} orders)`;
    }),
    '',
    '> These products are flying off the shelves! 🚀 Make sure to feature them in your next video.',
  ];

  return lines.join('\n');
}

export function generateWeeklyRecapPost(
  brand: string,
  summary: BrandSummary | null,
  topCreators: CreatorRanking[],
  topProducts: ProductSummary[],
  dateLabel: string,
): string {
  if (!summary) return `📊 **Weekly Recap — ${bn(brand)}**\n\nNo data available for this period.`;

  const top3Creators = topCreators.slice(0, 3);
  const top3Products = topProducts.slice(0, 3);

  const lines = [
    `📊 **Weekly Brand Recap — ${bn(brand)}**`,
    `📅 ${dateLabel}`,
    '',
    '**📈 Performance Summary**',
    `• GMV: **${fmtCurrency(summary.total_gmv)}**`,
    `• Orders: **${fmtNum(summary.total_orders)}**`,
    `• Items Sold: **${fmtNum(summary.total_items_sold)}**`,
    `• Active Creators: **${fmtNum(summary.unique_creators)}**`,
    `• Videos: **${fmtNum(summary.total_videos)}**`,
    '',
  ];

  if (top3Creators.length > 0) {
    lines.push('**🏆 Top Creators**');
    top3Creators.forEach((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      lines.push(`${medal} @${c.creator_name} — ${fmtCurrency(c.total_gmv)}`);
    });
    lines.push('');
  }

  if (top3Products.length > 0) {
    lines.push('**🔥 Top Products**');
    top3Products.forEach((p, i) => {
      const name = p.product_name.length > 45 ? p.product_name.slice(0, 42) + '...' : p.product_name;
      lines.push(`**${i + 1}.** ${name} — ${fmtCurrency(p.total_gmv)}`);
    });
    lines.push('');
  }

  lines.push('> Great work this week, team! 🎉 Let\'s keep the momentum going.');

  return lines.join('\n');
}
