/**
 * Single source of truth for all marketing copy on the landing page.
 * Edit copy here without touching JSX.
 */

import type { LucideIcon } from 'lucide-react';
import {
  FileSpreadsheet,
  EyeOff,
  Flame,
  Plug,
  BarChart2,
  Users,
} from 'lucide-react';

export type ComparisonValue = boolean | 'partial' | string;
export type ComparisonContent = {
  label: string;
  title: string;
  subtitle: string;
  columns: Array<{ name: string; highlight?: boolean }>;
  rows: Array<{ label: string; values: ComparisonValue[] }>;
  summaryRows?: Array<{ label: string; values: ComparisonValue[] }>;
};

export const LANDING_CONTENT = {
  // ── Site / SEO ──────────────────────────────────────────────
  siteName: 'Tempo',
  siteUrl: 'https://app.tempoapp.ai',
  bookDemoUrl: 'https://cal.com/tyler3p/tempo-demo',

  // ── Navbar ──────────────────────────────────────────────────
  nav: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Compare', href: '#compare' },
    { label: 'Changelog', href: '/changelog' },
  ],

  // ── Hero ────────────────────────────────────────────────────
  hero: {
    badge: 'Now Accepting New Clients',
    headline: {
      lead: 'Run your TikTok Shop creator program',
      gradient: 'like a $10M brand',
    },
    subhead:
      'Stop managing creators in spreadsheets. Tempo gives you real-time GMV, creator rankings, and Discord-native communication — all in one place.',
    primaryCta: { label: 'Book a Demo', href: 'https://cal.com/tyler3p/tempo-demo' },
    secondaryCta: { label: 'See the Platform', href: '#features' },
    socialProof: 'Built by the team behind 6 TikTok Shop brands and 980+ creators',
  },

  // ── Stats Bar ───────────────────────────────────────────────
  // Framed as "the team behind Tempo manages…" — these are the operators'
  // own portfolio numbers, not paying-customer aggregates.
  statsLabel: 'The team behind Tempo manages',
  stats: [
    { value: 980, suffix: '+', label: 'Creators across the portfolio' },
    { value: 12, prefix: '$', suffix: 'M+', label: 'Annual GMV moving through' },
    { value: 400, suffix: 'K+', label: 'Videos analyzed and ranked' },
  ] as Array<{ value: number; prefix?: string; suffix?: string; label: string }>,

  // ── Brand Marquee ───────────────────────────────────────────
  marqueeLabel: 'From the team behind these TikTok Shop brands',
  marqueeBrands: [
    { name: 'Cata-Kor', color: '#00C853' },
    { name: 'JiYu', color: '#E91E8C' },
    { name: "Physicians Choice", color: '#2196F3' },
    { name: 'Toplux Nutrition', color: '#FF9800' },
    { name: 'Peach Slices', color: '#FF8FA3' },
    { name: 'Yerba Magic', color: '#7C5CFC' },
    { name: 'Leefar', color: '#06B6D4' },
    { name: 'Lemme', color: '#FBBF24' },
  ],

  // ── Problem Section ─────────────────────────────────────────
  problem: {
    title: 'Sound familiar?',
    subtitle: 'Every TikTok Shop brand hits the same wall.',
    items: [
      {
        icon: FileSpreadsheet,
        title: 'Death by Spreadsheet',
        desc: "You're exporting CSVs every morning, pasting into Google Sheets, and manually calculating commissions. There's a better way.",
      },
      {
        icon: EyeOff,
        title: 'Flying Blind',
        desc: "A creator's video went viral and you found out when they texted you. You need real-time alerts, not reactive catch-ups.",
      },
      {
        icon: Flame,
        title: 'Scaling = More Chaos',
        desc: "Going from 10 to 100 creators means 10x the spreadsheets, 10x the exports, 10x the DMs. The old way doesn't scale.",
      },
    ] as Array<{ icon: LucideIcon; title: string; desc: string }>,
  },

  // ── How It Works ────────────────────────────────────────────
  howItWorks: {
    label: 'How It Works',
    title: 'Up and running in minutes',
    subtitle: 'No engineering required. Connect your shop, and the data flows in automatically.',
    steps: [
      {
        num: '01',
        Icon: Plug,
        title: 'Connect Your Shop',
        desc: 'Link your TikTok Shop in minutes. Tempo pulls in all creator, video, and GMV data automatically — no CSV exports, no manual work.',
      },
      {
        num: '02',
        Icon: BarChart2,
        title: 'Track Everything',
        desc: 'Real-time dashboards show GMV, creator rankings, video performance, and commissions. Updated daily, visualized instantly.',
      },
      {
        num: '03',
        Icon: Users,
        title: 'Manage Your Creators',
        desc: 'Message creators via Discord, track retainers, send daily briefs, and retain your top talent — all from one platform.',
      },
    ] as Array<{ num: string; Icon: LucideIcon; title: string; desc: string }>,
  },

  // ── Features (long-form sections) ───────────────────────────
  // landing: true → renders on the homepage. false → only on /features.
  // screenshot: optional path to a real product screenshot; when set, the
  //   <ProductMockup> renders the image instead of the animated SVG.
  features: [
    {
      slug: 'analytics',
      tag: 'Analytics',
      icon: 'BarChart2',
      headline: 'Track every dollar in real time',
      description:
        'GMV, orders, commissions, creator performance. Updated daily, visualized instantly. No more waiting on Seller Center.',
      landing: true,
      screenshot: undefined as string | undefined,
    },
    {
      slug: 'creator-rankings',
      tag: 'Creator Rankings',
      icon: 'Trophy',
      headline: "Know who's crushing it and who needs attention",
      description:
        'Rankings update automatically. See your top performers, spot early warning signs, and act before issues compound.',
      landing: false,
      screenshot: undefined as string | undefined,
    },
    // Tempo Bot is rendered separately because of its custom layout
    {
      slug: 'multi-brand',
      tag: 'Multi-Brand',
      icon: 'LayoutGrid',
      headline: 'Your whole operation, one dashboard',
      description:
        'Manage multiple brands without switching tools. Creators, videos, GMV, and commissions — all in one place.',
      landing: false,
      screenshot: undefined as string | undefined,
    },
    {
      slug: 'daily-briefs',
      tag: 'Daily Briefs',
      icon: 'Sunrise',
      headline: 'Reports that write themselves',
      description:
        "Wake up to a daily performance brief. Know exactly where you stand before your first cup of coffee.",
      landing: false,
      screenshot: undefined as string | undefined,
    },
    {
      slug: 'creator-portal',
      tag: 'Creator Portal',
      icon: 'UserCircle',
      headline: 'A portal your creators will actually use',
      description:
        'Give creators their own dashboard to track performance, discover winning content, and stay motivated.',
      landing: true,
      screenshot: undefined as string | undefined,
    },
  ],

  // Hero dashboard mockup screenshot (replaces SVG when set)
  heroScreenshot: undefined as string | undefined,

  // ── Comparison ──────────────────────────────────────────────
  comparison: {
    label: 'How Tempo compares',
    title: 'The only tool built for TikTok Shop creator programs',
    subtitle:
      'Seller Center is for sellers. Kalodata is for analytics. Spreadsheets are spreadsheets. Tempo is for creator program operators.',
    columns: [
      { name: 'Tempo', highlight: true },
      { name: 'Seller Center' },
      { name: 'Kalodata' },
      { name: 'Spreadsheets' },
    ],
    rows: [
      { label: 'Built specifically for TikTok Shop',   values: [true,  true,  true,  false] },
      { label: 'Near real-time GMV tracking',          values: [true,  'partial',  true,  false] },
      { label: 'Creator rankings & posting status',    values: [true,  false, 'partial', false] },
      { label: 'Discord-native messaging',             values: [true,  false, false, false] },
      { label: 'Bulk creator messaging',               values: [true,  false, false, false] },
      { label: 'Retainer & commission tracking',       values: [true,  false, false, 'partial'] },
      { label: 'Daily auto-generated briefs',          values: [true,  false, false, false] },
      { label: 'Multi-brand portfolio view',           values: [true,  false, 'partial', 'partial'] },
      { label: 'Creator-facing portal',                values: [true,  false, false, false] },
      { label: 'No engineering required to set up',    values: [true,  true,  true,  true] },
    ],
    // Footer-style rows that mix text values — separated from the binary grid.
    summaryRows: [
      { label: 'Setup time',     values: ['~5 minutes',     'Already on',     '1–2 hours',  'Ongoing'] },
      { label: 'Monthly cost',   values: ['$1,999 / mo',    'Free w/ Shop',   '$300+ / mo',     '$0 + your time'] },
    ],
  } as ComparisonContent,

  // ── Changelog ───────────────────────────────────────────────
  changelogIntro: {
    label: 'Changelog',
    title: "What's new in Tempo",
    subtitle: 'Every shipped change, big or small.',
  },

  // ── Tempo Bot (Discord) section ─────────────────────────────
  tempoBot: {
    badge: 'Tempo Bot',
    tag: 'Discord Integration',
    headline: {
      lead: 'Your creators are on Discord.',
      gradient: 'So should you.',
    },
    subhead:
      'Tempo Bot brings creator management directly to Discord. Manage everything from where your creators already are.',
    features: [
      { title: 'DM Relay', desc: 'Message creators directly from Tempo. No switching apps.' },
      { title: 'Bulk Messaging', desc: 'Send updates to multiple creators at once.' },
      { title: 'Creator Status Alerts', desc: 'Get notified when creators go offline or underperform.' },
      { title: 'Retainer Tracking', desc: 'Automated nudges for payment schedules and contract renewals.' },
    ],
  },

  // ── FAQ ─────────────────────────────────────────────────────
  faqs: [
    {
      q: 'What platforms does Tempo support?',
      a: "We're laser-focused on TikTok Shop right now. That's where the biggest opportunity is, and we'd rather be the best TikTok Shop tool than a mediocre everything tool.",
    },
    {
      q: 'How does data get into Tempo?',
      a: 'Tempo syncs your TikTok Shop data automatically every day. No manual exports, no CSV uploads. Just connect your shop and the data flows in.',
    },
    {
      q: 'How is Tempo different from Seller Center or Kalodata?',
      a: "Seller Center and Kalodata give you data. Tempo gives you tools to actually manage creator relationships. Discord bot for DMs, bulk messaging, status alerts, retainer tracking. It's creator relationship management, not just analytics.",
    },
    {
      q: 'Can multiple people use Tempo for the same brand?',
      a: 'Yes. Invite your team with role-based access. Everyone sees the data they need without stepping on each other.',
    },
    {
      q: 'Is my data secure?',
      a: 'Your data is isolated at the database level using row-level security. Other tenants can never see your data, period. We use Supabase (built on Postgres) with enterprise-grade encryption.',
    },
    {
      q: 'Do I need to be technical to use Tempo?',
      a: "Not at all. If you can use a spreadsheet, you can use Tempo. We handle the data pipeline. You just log in and see your numbers.",
    },
    {
      q: 'How long until I see ROI?',
      a: "Most brands save 5+ hours per week in week one just from killing the spreadsheet workflow. The deeper ROI comes from spotting underperforming creators early — usually within the first month.",
    },
  ],

  // ── Final CTA ───────────────────────────────────────────────
  finalCta: {
    title: 'Ready to stop flying blind?',
    subtitle: 'Pick the path that fits where you are.',
    cards: {
      start: {
        title: 'Get Started',
        bestFor: 'Best for brands ready to set up today',
        bullets: ['You know what you need', 'Live in under 5 minutes', 'No call required'],
        cta: { label: 'Create Your Account', href: '/onboarding' },
      },
      demo: {
        title: 'Book a Demo',
        bestFor: 'Best for brands evaluating multiple tools',
        bullets: ['Walks through your specific use case', 'See your data flow first', 'Need stakeholder buy-in'],
        cta: { label: 'Schedule a Call', href: 'https://cal.com/tyler3p/tempo-demo' },
      },
    },
  },

  // ── Footer ──────────────────────────────────────────────────
  footer: {
    tagline: 'The creator management platform for serious TikTok Shop brands and agencies.',
    newsletter: {
      title: 'Stay in the loop',
      desc: 'Product updates, TikTok Shop tactics, and changelog highlights. No spam.',
      placeholder: 'you@brand.com',
      cta: 'Subscribe',
    },
    columns: [
      {
        label: 'Product',
        links: [
          { label: 'Features', href: '/features' },
          { label: 'Pricing', href: '/#pricing' },
          { label: 'Compare', href: '/#compare' },
          { label: 'Changelog', href: '/changelog' },
        ],
      },
      {
        label: 'Company',
        links: [
          { label: 'Privacy', href: '/legal/privacy' },
          { label: 'Terms', href: '/legal/terms' },
          { label: 'Status', href: '/status' },
          { label: 'Book a Demo', href: 'https://cal.com/tyler3p/tempo-demo' },
        ],
      },
    ],
    copyright: '© 2026 Tempo. All rights reserved.',
  },
};

export type LandingContent = typeof LANDING_CONTENT;
