'use client';

import { formatCurrency } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

interface BrandData {
  brand: string;
  gmv: number;
  trend: number | undefined;
}

interface Props {
  brands: BrandData[];
  topVideoGmv: number;
  topCreatorName?: string;
  topCreatorGmv: number;
  portfolioChange: number | undefined;
  totalGmv: number;
  period: string;
}

function generateHeadline({
  topVideoGmv,
  topCreatorName,
  topCreatorGmv,
  portfolioChange,
  totalGmv,
  period,
}: {
  topVideoGmv: number;
  topCreatorName?: string;
  topCreatorGmv: number;
  portfolioChange: number | undefined;
  totalGmv: number;
  period: string;
}): string {
  // Priority 1: Big video hit
  if (topVideoGmv >= 500) {
    return `Video Hits ${formatCurrency(topVideoGmv)} in Sales`;
  }
  
  // Priority 2: Portfolio change > 30% up
  if (portfolioChange !== undefined && portfolioChange > 30) {
    return `Portfolio Up ${portfolioChange.toFixed(0)}% vs ${period}`;
  }
  
  // Priority 3: Portfolio change < -30% down  
  if (portfolioChange !== undefined && portfolioChange < -30) {
    return `Portfolio Down ${Math.abs(portfolioChange).toFixed(0)}% vs ${period}`;
  }
  
  // Priority 4: Top creator hit
  if (topCreatorName && topCreatorGmv >= 1000) {
    return `${topCreatorName} Leads the Pack`;
  }
  
  // Fallback: Total sales
  return `${formatCurrency(totalGmv)} in Sales This ${period}`;
}

function getPortfolioWeather(brands: BrandData[]): string {
  if (brands.length === 0) return '⚡';
  
  const brandsWithTrend = brands.filter(b => b.trend !== undefined);
  if (brandsWithTrend.length === 0) return '⚡';
  
  const brandsUp = brandsWithTrend.filter(b => b.trend! > 0).length;
  const brandsDown = brandsWithTrend.filter(b => b.trend! < 0).length;
  const upRatio = brandsUp / brandsWithTrend.length;
  
  if (upRatio >= 0.75) return '☀️';  // Sunny: 75%+ brands up
  if (upRatio >= 0.25) return '⛅';  // Mixed: 25-75% brands up
  return '🌧️';  // Rainy: <25% brands up
}

function generateQuickHits({
  brands,
  topCreatorName,
  topCreatorGmv,
  topVideoGmv,
  portfolioChange,
}: {
  brands: BrandData[];
  topCreatorName?: string;
  topCreatorGmv: number;
  topVideoGmv: number;
  portfolioChange: number | undefined;
}): string[] {
  const hits: string[] = [];
  
  // Top gainer brand
  const gainers = brands.filter(b => b.trend !== undefined && b.trend > 0)
    .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0));
  if (gainers.length > 0) {
    const top = gainers[0];
    hits.push(`${BRAND_DISPLAY_NAMES[top.brand] ?? top.brand} leads (+${top.trend!.toFixed(0)}%)`);
  }
  
  // Declining brand
  const decliners = brands.filter(b => b.trend !== undefined && b.trend < 0)
    .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0));
  if (decliners.length > 0) {
    const worst = decliners[0];
    hits.push(`${BRAND_DISPLAY_NAMES[worst.brand] ?? worst.brand} down ${Math.abs(worst.trend!).toFixed(0)}%`);
  }
  
  // Top creator
  if (topCreatorName && topCreatorGmv > 0) {
    hits.push(`${topCreatorName} top creator (${formatCurrency(topCreatorGmv)})`);
  }
  
  // Top video
  if (topVideoGmv > 0) {
    hits.push(`Top video: ${formatCurrency(topVideoGmv)}`);
  }
  
  // Portfolio change
  if (portfolioChange !== undefined && Math.abs(portfolioChange) > 10) {
    const direction = portfolioChange > 0 ? 'up' : 'down';
    hits.push(`Portfolio ${direction} ${Math.abs(portfolioChange).toFixed(0)}%`);
  }
  
  return hits.slice(0, 4); // Max 4 quick hits
}

export function DailyHeadline({
  brands,
  topVideoGmv,
  topCreatorName,
  topCreatorGmv,
  portfolioChange,
  totalGmv,
  period = 'Period',
}: Props) {
  const weather = getPortfolioWeather(brands);
  const headline = generateHeadline({
    topVideoGmv,
    topCreatorName,
    topCreatorGmv,
    portfolioChange,
    totalGmv,
    period,
  });
  
  const quickHits = generateQuickHits({
    brands,
    topCreatorName,
    topCreatorGmv,
    topVideoGmv,
    portfolioChange,
  });

  return (
    <div className="relative rounded-2xl border border-white/40 p-6 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,249,252,0.95) 100%)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      {/* Main Headline */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{weather}</span>
        <h1 className="text-xl font-bold text-[#1A1B3A] leading-tight">
          {headline}
        </h1>
      </div>

      {/* Quick Hits */}
      {quickHits.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Quick Hits</p>
          {quickHits.map((hit, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-[#FF4D8D] font-bold text-sm mt-0.5">•</span>
              <p className="text-sm text-gray-700">{hit}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}