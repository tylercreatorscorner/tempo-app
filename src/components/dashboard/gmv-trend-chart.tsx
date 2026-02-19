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
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

export function GmvTrendChart({ data, brands }: Props) {
  if (!data.length) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
        No trend data available for selected period
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            {brands.map((brand) => {
              const color = BRAND_COLORS[brand] ?? '#6B7280';
              return (
                <linearGradient key={brand} id={`gradient-${brand}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.45)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatDollar}
            tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.45)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(20,20,30,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              fontSize: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}
            itemStyle={{ padding: '2px 0' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [
              `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              BRAND_DISPLAY_NAMES[name as string] ?? name,
            ]}
          />
          <Legend
            formatter={(value: string) => BRAND_DISPLAY_NAMES[value] ?? value}
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
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
              animationDuration={1200}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
