import type { CreatorRanking, ProductSummary, BrandSummary } from '@/types/database';

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Build the weekly brand recap post. `brandName` is the already-resolved display
 *  name (the caller resolves it from the brand registry). */
export function generateWeeklyRecapPost(
  brandName: string,
  summary: BrandSummary | null,
  topCreators: CreatorRanking[],
  topProducts: ProductSummary[],
  dateLabel: string,
): string {
  if (!summary) return `📊 **Weekly Recap — ${brandName}**\n\nNo data available for this period.`;

  const top3Creators = topCreators.slice(0, 3);
  const top3Products = topProducts.slice(0, 3);

  const lines = [
    `📊 **Weekly Brand Recap — ${brandName}**`,
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
