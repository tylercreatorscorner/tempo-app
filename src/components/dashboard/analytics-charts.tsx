'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BRAND_COLORS } from '@/lib/utils/constants';

interface CreatorGrowthItem {
  brand: string;
  brandKey: string;
  creators: number;
  videos: number;
}

interface ProductRanking {
  name: string;
  gmv: number;
  orders: number;
  brand: string;
}

interface VideoDistItem {
  range: string;
  count: number;
}

interface Props {
  creatorGrowthData: CreatorGrowthItem[];
  productRankings: ProductRanking[];
  videoDistribution: VideoDistItem[];
}

const PIE_COLORS = ['#6B7280', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const TOOLTIP_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

function formatDollar(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

export function AnalyticsCharts({ creatorGrowthData, productRankings, videoDistribution }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-[#1A1B3A]">Creators & Videos by Brand</h3>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={creatorGrowthData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="brand" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="creators" name="Creators" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="videos" name="Videos" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px', color: '#6B7280' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-[#1A1B3A]">Video GMV Distribution</h3>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={videoDistribution.filter((d) => d.count > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="count"
                nameKey="range"
                paddingAngle={2}
              >
                {videoDistribution.filter((d) => d.count > 0).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#6B7280' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4 text-[#1A1B3A]">Top Products by GMV</h3>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={productRankings}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" tickFormatter={formatDollar} tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: '#374151' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`$${Number(value ?? 0).toLocaleString()}`, 'GMV']}
              />
              <Bar
                dataKey="gmv"
                name="GMV"
                radius={[0, 4, 4, 0]}
              >
                {productRankings.map((entry, i) => (
                  <Cell key={i} fill={BRAND_COLORS[entry.brand] ?? '#6B7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
