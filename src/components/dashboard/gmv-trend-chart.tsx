'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

export function GmvTrendChart({ data, brands }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
        No trend data available for selected period
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: 340, minHeight: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <defs>
            {brands.map((brand) => {
              const color = BRAND_COLORS[brand] ?? '#6B7280';
              return (
                <linearGradient key={brand} id={`gradient-${brand}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
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
          <Legend
            formatter={(value: string) => BRAND_DISPLAY_NAMES[value] ?? value}
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: '#6B7280' }}
          />
          {brands.map((brand) => (
            <Area
              key={brand}
              type="monotone"
              dataKey={brand}
              stackId="1"
              stroke={BRAND_COLORS[brand] ?? '#6B7280'}
              fill={`url(#gradient-${brand})`}
              strokeWidth={2}
              animationDuration={1500}
              animationEasing="ease-out"
              dot={false}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                stroke: BRAND_COLORS[brand] ?? '#6B7280',
                fill: '#FFFFFF',
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
