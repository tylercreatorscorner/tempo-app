'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, DollarSign, FileText, Clock, Users, TrendingUp,
  ArrowUpRight, ArrowDownRight, Filter, Download, ChevronRight,
  Percent, History, AlertCircle, CheckCircle, Send, Eye
} from 'lucide-react';
import {
  BRAND_COLORS, BRAND_DISPLAY_NAMES, ACTIVE_BRANDS, getBrandColor
} from '@/lib/utils/constants';

// ─── Types ───────────────────────────────────────────────────────────

interface OverviewData {
  totalRetainerSpend: number;
  totalCommissionsOwed: number;
  outstandingInvoices: number;
  outstandingAmount: number;
  paidThisMonth: number;
  brandSpend: Record<string, number>;
  recentActivity: any[];
}

interface RetainerCreator {
  creator_name: string;
  brand: string;
  retainer: number;
  posts_required: number;
  posts_found: number;
  monthly_post_requirement: number;
  retainer_start_date: string;
  status: string;
  payment_status: string;
}

interface CommissionData {
  brandRates: { brand: string; commission_rate: number }[];
  bumpCreators: { creator_name: string; brand: string; rate: number; created_at: string }[];
  commissions: any[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  brand: string;
  period_month: string;
  total_amount: number;
  commission: number;
  retainer: number;
  launch_fee: number;
  affiliate_gmv: number;
  marketing_gmv: number;
  total_gmv: number;
  status: string;
  generated_at: string;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
}

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  creator_name: string | null;
  brand: string | null;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const TABS = ['Overview', 'Retainer Tracking', 'Commissions', 'Invoices', 'History'] as const;
type Tab = typeof TABS[number];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatCurrencyExact(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function brandDisplayName(slug: string): string {
  return BRAND_DISPLAY_NAMES[slug] || slug;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved: 'bg-blue-50 text-blue-700 border-blue-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    paid: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function BrandPill({ brand }: { brand: string }) {
  const color = getBrandColor(brand);
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {brandDisplayName(brand)}
    </span>
  );
}

function RetainerStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: any }> = {
    'On Track': { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle },
    'Behind': { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: AlertCircle },
    'At Risk': { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircle },
  };
  const c = config[status] || config['On Track'];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function BrandFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm font-medium text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 cursor-pointer"
      >
        <option value="all">All Brands</option>
        {ACTIVE_BRANDS.map((b) => (
          <option key={b} value={b}>{brandDisplayName(b)}</option>
        ))}
      </select>
      <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

function CardSkeleton() {
  return <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 animate-pulse h-28" />;
}

function TableSkeleton() {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
    </div>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────

function SummaryCard({ title, value, subtitle, icon: Icon, gradient }: {
  title: string; value: string; subtitle?: string; icon: any; gradient: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-[#1A1B3A] mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${gradient}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

// ─── Brand Spend Bar Chart ───────────────────────────────────────────

function BrandSpendChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4">Monthly Spend by Brand</h3>
        <p className="text-sm text-gray-400 text-center py-8">No spend data available yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4">Monthly Retainer Spend by Brand</h3>
      <div className="space-y-3">
        {entries.map(([brand, amount]) => (
          <div key={brand}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-[#1A1B3A]">{brandDisplayName(brand)}</span>
              <span className="text-gray-500">{formatCurrency(amount)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(amount / max) * 100}%`, backgroundColor: getBrandColor(brand) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity Feed ────────────────────────────────────────────

function ActivityFeed({ items }: { items: any[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4">Recent Payment Activity</h3>
        <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4">Recent Payment Activity</h3>
      <div className="space-y-3">
        {items.slice(0, 8).map((item: any) => (
          <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
              item.payment_type === 'retainer' ? 'bg-purple-50' : 'bg-green-50'
            }`}>
              {item.payment_type === 'retainer'
                ? <Users className="h-4 w-4 text-purple-500" />
                : <TrendingUp className="h-4 w-4 text-green-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1A1B3A] truncate">
                {item.creator_name} <span className="text-gray-400 font-normal">{item.payment_type}</span>
              </p>
              <p className="text-xs text-gray-400">{formatDate(item.date_submitted)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#1A1B3A]">{formatCurrencyExact(item.amount || 0)}</p>
              <StatusBadge status={item.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/payments/overview')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton />
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-gray-400 text-center py-12">Failed to load overview data</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Retainer Spend"
          value={formatCurrency(data.totalRetainerSpend)}
          subtitle="This month"
          icon={Users}
          gradient="bg-gradient-to-br from-purple-500 to-purple-600"
        />
        <SummaryCard
          title="Commissions Owed"
          value={formatCurrency(data.totalCommissionsOwed)}
          subtitle="Pending and approved"
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-green-500 to-green-600"
        />
        <SummaryCard
          title="Outstanding Invoices"
          value={String(data.outstandingInvoices)}
          subtitle={formatCurrency(data.outstandingAmount) + ' total'}
          icon={FileText}
          gradient="bg-gradient-to-br from-[#FF4D8D] to-pink-600"
        />
        <SummaryCard
          title="Paid This Month"
          value={formatCurrency(data.paidThisMonth)}
          subtitle="Completed payments"
          icon={CheckCircle}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BrandSpendChart data={data.brandSpend} />
        <ActivityFeed items={data.recentActivity} />
      </div>
    </div>
  );
}

// ─── Retainer Tracking Tab ───────────────────────────────────────────

function RetainerTab() {
  const [data, setData] = useState<{ creators: RetainerCreator[]; totalRetainerSpend: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('all');
  const [expandedCreator, setExpandedCreator] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/payments/retainers?brand=${brand}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {data && (
            <p className="text-sm text-gray-500">
              Total monthly retainer spend: <span className="font-semibold text-[#1A1B3A]">{formatCurrency(data.totalRetainerSpend)}</span>
            </p>
          )}
        </div>
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      {loading ? <TableSkeleton /> : !data || data.creators.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400">No creators with active retainers found</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Creator</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Brand</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Retainer</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Posts Req.</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Posts Found</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Start Date</th>
                </tr>
              </thead>
              <tbody>
                {data.creators.map((c) => (
                  <tr
                    key={`${c.creator_name}-${c.brand}`}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                    onClick={() => setExpandedCreator(expandedCreator === `${c.creator_name}|${c.brand}` ? null : `${c.creator_name}|${c.brand}`)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${expandedCreator === `${c.creator_name}|${c.brand}` ? 'rotate-90' : ''}`} />
                        <span className="text-sm font-medium text-[#1A1B3A]">{c.creator_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><BrandPill brand={c.brand} /></td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#1A1B3A]">{formatCurrency(c.retainer)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{c.monthly_post_requirement || c.posts_required || 0}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{c.posts_found}</td>
                    <td className="px-4 py-3 text-center"><RetainerStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.retainer_start_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Commissions Tab ─────────────────────────────────────────────────

function CommissionsTab() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('all');

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/payments/commissions?brand=${brand}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <TableSkeleton />;
  if (!data) return <p className="text-gray-400 text-center py-12">Failed to load commission data</p>;

  // Build a set of bump creators for quick lookup
  const bumpSet = new Set(data.bumpCreators.map(c => `${c.creator_name}|${c.brand}`));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      {/* Commission Rates */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4 flex items-center gap-2">
          <Percent className="h-4 w-4 text-[#FF4D8D]" />
          Base Commission Rates by Brand
        </h3>
        {data.brandRates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No commission rates configured</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.brandRates.map((br) => (
              <div key={br.brand} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getBrandColor(br.brand) }} />
                  <span className="text-sm font-semibold text-[#1A1B3A]">{brandDisplayName(br.brand)}</span>
                </div>
                <p className="text-2xl font-bold text-[#1A1B3A]">{br.commission_rate}%</p>
                <p className="text-xs text-gray-400 mt-1">Base rate</p>
              </div>
            ))}
          </div>
        )}

        {/* +1% Bump Creators */}
        {data.bumpCreators.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Creators with +1% Commission Bump
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.bumpCreators.map((c) => (
                <div key={`${c.creator_name}-${c.brand}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
                  <ArrowUpRight className="h-3 w-3 text-green-600" />
                  <span className="text-xs font-medium text-green-700">{c.creator_name}</span>
                  <BrandPill brand={c.brand} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Commission Breakdown */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 pb-0">
          <h3 className="text-sm font-semibold text-[#1A1B3A] mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[#FF4D8D]" />
            Commission Breakdown (This Period)
          </h3>
        </div>
        {data.commissions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 px-6">No commission payments recorded this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Creator</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Brand</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">GMV</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Commission</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Tier</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-[#1A1B3A]">{c.creator_name}</td>
                    <td className="px-4 py-3"><BrandPill brand={c.brand} /></td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatCurrencyExact(c.gmv_in_period || 0)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#1A1B3A]">{formatCurrencyExact(c.amount || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {bumpSet.has(`${c.creator_name}|${c.brand}`) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          <ArrowUpRight className="h-3 w-3" /> +1%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Standard</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-center"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invoices Tab ────────────────────────────────────────────────────

function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/payments/invoices')
      .then(r => r.json())
      .then(d => setInvoices(d.invoices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <TableSkeleton />;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      {invoices.length === 0 ? (
        <div className="p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">No invoices generated yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Invoice #</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Brand</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Period</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Total</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Generated</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Sent</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Paid</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3 text-sm font-mono font-medium text-[#1A1B3A]">{inv.invoice_number}</td>
                  <td className="px-4 py-3"><BrandPill brand={inv.brand} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.period_month}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-[#1A1B3A]">{formatCurrencyExact(inv.total_amount)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.generated_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.sent_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(inv.paid_at)}</td>
                  <td className="px-6 py-3 text-center">
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#FF4D8D] bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors">
                      <Eye className="h-3 w-3" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────

function HistoryTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('all');

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/payments/history?brand=${brand}`)
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const entityIcon = (type: string) => {
    switch (type) {
      case 'retainer': return <Users className="h-4 w-4 text-purple-500" />;
      case 'commission_rate': return <Percent className="h-4 w-4 text-green-500" />;
      case 'payment_status': return <CreditCard className="h-4 w-4 text-blue-500" />;
      case 'invoice_status': return <FileText className="h-4 w-4 text-pink-500" />;
      default: return <History className="h-4 w-4 text-gray-400" />;
    }
  };

  const entityBg = (type: string) => {
    switch (type) {
      case 'retainer': return 'bg-purple-50';
      case 'commission_rate': return 'bg-green-50';
      case 'payment_status': return 'bg-blue-50';
      case 'invoice_status': return 'bg-pink-50';
      default: return 'bg-gray-50';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Payment audit log</h3>
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      {loading ? <TableSkeleton /> : logs.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
            <History className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">No audit history recorded yet</p>
          <p className="text-xs text-gray-300 mt-1">Changes to retainers, commission rates, and payment statuses will appear here</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${entityBg(log.entity_type)}`}>
                  {entityIcon(log.entity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1A1B3A]">
                    <span className="font-medium">{log.field_changed}</span>
                    {log.creator_name && <> for <span className="font-medium">{log.creator_name}</span></>}
                    {log.brand && <> ({brandDisplayName(log.brand)})</>}
                    {' changed'}
                    {log.old_value && <> from <span className="font-mono text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{log.old_value}</span></>}
                    {log.new_value && <> to <span className="font-mono text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{log.new_value}</span></>}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                    <span className="text-xs text-gray-300">by {log.changed_by}</span>
                    {log.reason && <span className="text-xs text-gray-400 italic">{log.reason}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Payments Client ────────────────────────────────────────────

export function PaymentsClient() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab
                ? 'bg-[#FF4D8D] text-white shadow-sm'
                : 'text-gray-500 hover:text-[#1A1B3A] hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && <OverviewTab />}
      {activeTab === 'Retainer Tracking' && <RetainerTab />}
      {activeTab === 'Commissions' && <CommissionsTab />}
      {activeTab === 'Invoices' && <InvoicesTab />}
      {activeTab === 'History' && <HistoryTab />}
    </div>
  );
}
