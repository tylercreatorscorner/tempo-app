'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

interface TrendDataPoint {
  date: string;
  [brand: string]: number | string;
}

interface Props {
  data: TrendDataPoint[];
  brands: string[];
}

function formatDollar(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

function ChartLegend({ brands }: { brands: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {brands.map((brand) => {
        const color = BRAND_COLORS[brand] ?? '#6B7280';
        const name = BRAND_DISPLAY_NAMES[brand] ?? brand;
        return (
          <div key={brand} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-medium text-gray-600">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GmvTrendChart({ data, brands }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
        No trend data available for selected period
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <ChartLegend brands={brands} />
      </div>
      <div className="w-full" style={{ height: 340, minHeight: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={formatDollar}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              dx={-4}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                fontSize: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                padding: '12px 16px',
              }}
              labelStyle={{ color: '#6B7280', marginBottom: 6, fontWeight: 500 }}
              itemStyle={{ padding: '2px 0' }}
              cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                BRAND_DISPLAY_NAMES[name] ?? name,
              ]}
            />
            {brands.map((brand) => (
              <Line
                key={brand}
                type="monotone"
                dataKey={brand}
                stroke={BRAND_COLORS[brand] ?? '#6B7280'}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: BRAND_COLORS[brand] ?? '#6B7280',
                  fill: '#FFFFFF',
                }}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
