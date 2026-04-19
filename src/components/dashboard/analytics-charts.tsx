'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { BRAND_COLORS } from '@/lib/utils/constants';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

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

function fmtDollar(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val}`;
}

const CHART_COLORS = ['#7C5CFC', '#FF4D8D', '#10B981', '#F59E0B', '#3B82F6', '#EF4444'];

export function AnalyticsCharts({ creatorGrowthData, productRankings, videoDistribution }: Props) {
  const creatorBarOptions: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'inherit', background: 'transparent' },
    plotOptions: { bar: { borderRadius: 5, borderRadiusApplication: 'end', columnWidth: '55%' } },
    colors: ['#7C5CFC', '#FF4D8D'],
    dataLabels: { enabled: false },
    xaxis: {
      categories: creatorGrowthData.map(d => d.brand),
      labels: { style: { colors: '#6B7280', fontSize: '12px', fontFamily: 'inherit' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' } },
    },
    grid: { borderColor: '#F3F4F6', strokeDashArray: 4, xaxis: { lines: { show: false } } },
    legend: {
      fontSize: '12px',
      fontFamily: 'inherit',
      labels: { colors: '#6B7280' },
      markers: { size: 8 },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
    },
  };

  const filteredDist = videoDistribution.filter(d => d.count > 0);
  const donutOptions: ApexOptions = {
    chart: { type: 'donut', toolbar: { show: false }, fontFamily: 'inherit', background: 'transparent' },
    labels: filteredDist.map(d => d.range),
    colors: CHART_COLORS,
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Videos',
              color: '#9CA3AF',
              fontSize: '12px',
              fontFamily: 'inherit',
              formatter: w => w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toString(),
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    legend: {
      position: 'bottom',
      fontSize: '12px',
      fontFamily: 'inherit',
      labels: { colors: '#6B7280' },
      markers: { size: 8 },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
    },
  };

  const productBarOptions: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'inherit', background: 'transparent' },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 5,
        borderRadiusApplication: 'end',
        barHeight: '60%',
        distributed: true,
      },
    },
    colors: productRankings.map(p => BRAND_COLORS[p.brand] ?? '#7C5CFC'),
    dataLabels: {
      enabled: true,
      formatter: val => fmtDollar(Number(val)),
      style: { fontSize: '10px', fontFamily: 'inherit', colors: ['#6B7280'] },
      offsetX: 6,
    },
    xaxis: {
      categories: productRankings.map(p => p.name.length > 30 ? p.name.slice(0, 29) + '…' : p.name),
      labels: {
        formatter: val => fmtDollar(Number(val)),
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#374151', fontSize: '11px', fontFamily: 'inherit' },
        maxWidth: 200,
      },
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    legend: { show: false },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: { formatter: val => `$${Number(val).toLocaleString()}` },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold mb-1 text-[#1A1B3A]">Creators & Videos by Brand</h3>
        <p className="text-xs text-gray-400 mb-4">Active contributors per brand</p>
        <ApexChart
          type="bar"
          series={[
            { name: 'Creators', data: creatorGrowthData.map(d => d.creators) },
            { name: 'Videos', data: creatorGrowthData.map(d => d.videos) },
          ]}
          options={creatorBarOptions}
          height={300}
          width="100%"
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold mb-1 text-[#1A1B3A]">Video GMV Distribution</h3>
        <p className="text-xs text-gray-400 mb-4">Videos grouped by revenue range</p>
        {filteredDist.length > 0 ? (
          <ApexChart
            type="donut"
            series={filteredDist.map(d => d.count)}
            options={donutOptions}
            height={300}
            width="100%"
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No video data</div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
        <h3 className="text-base font-semibold mb-1 text-[#1A1B3A]">Top Products by GMV</h3>
        <p className="text-xs text-gray-400 mb-4">Best performing products this period</p>
        {productRankings.length > 0 ? (
          <ApexChart
            type="bar"
            series={[{ name: 'GMV', data: productRankings.map(p => p.gmv) }]}
            options={productBarOptions}
            height={Math.max(300, productRankings.length * 36 + 60)}
            width="100%"
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No product data</div>
        )}
      </div>
    </div>
  );
}
