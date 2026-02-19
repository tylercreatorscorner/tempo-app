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

function formatDollar(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

export function AnalyticsCharts({ creatorGrowthData, productRankings, videoDistribution }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Creator & Video count by brand */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Creators & Videos by Brand</h3>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={creatorGrowthData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="brand" tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.45)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.45)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(20,20,30,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="creators" name="Creators" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="videos" name="Videos" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Video GMV Distribution */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Video GMV Distribution</h3>
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
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(20,20,30,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product Performance Rankings */}
      <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4">Top Products by GMV</h3>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={productRankings}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tickFormatter={formatDollar} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(20,20,30,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
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
