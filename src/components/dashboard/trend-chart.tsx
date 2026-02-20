'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { DailyTrend } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

interface TrendChartProps {
  data: DailyTrend[];
  className?: string;
}

/** GMV trend line chart */
export function TrendChart({ data, className }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-muted-foreground ${className ?? ''}`}>
        No trend data available
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(val: string) => val.slice(5)}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(val: number) => formatCurrency(val)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              color: '#1A1B3A',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
            formatter={(value) => [formatCurrency(value as number), 'GMV']}
          />
          <Line
            type="monotone"
            dataKey="gmv"
            stroke="#E91E63"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
