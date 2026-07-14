'use client';

import { Compass, TrendingUp, Play, Flame, Search, Filter } from 'lucide-react';

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discover</h1>
          <p className="text-sm text-muted-foreground mt-1">
            See what&apos;s working across TikTok Shop. Find trending videos, rising creators, and winning products.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground flex items-center gap-2 cursor-not-allowed opacity-50">
            <Filter className="h-4 w-4" /> Filters
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search videos, creators, products..."
              disabled
              className="pl-9 pr-4 py-2 rounded-lg border border-border text-sm w-64 bg-muted cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { label: 'Trending Videos', icon: Flame, active: true },
          { label: 'Rising Creators', icon: TrendingUp, active: false },
          { label: 'Top Products', icon: Play, active: false },
        ].map((tab) => (
          <button
            key={tab.label}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab.active
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Coming soon state */}
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center mb-6 shadow-xl shadow-[var(--primary)]/20">
          <Compass className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Discover is Coming Soon</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Browse what&apos;s going viral across all of TikTok Shop. Find winning videos, rising creators, and trending products to inspire your strategy.
        </p>
        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
          {[
            'Viral video feed',
            'Category filters',
            'GMV leaderboards',
            'Creator scouting',
            'Product trends',
            'Save to watchlist',
            'Competitor tracking',
            'Content inspiration',
          ].map((feature) => (
            <span key={feature} className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
