'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, Upload, Search, Users, DollarSign, UserCheck, UserX } from 'lucide-react';
import { Suspense } from 'react';

function RosterContent() {
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand') || 'all';

  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (brand && brand !== 'all') params.set('brand', brand);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, statusFilter, search]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const totalRetainer = roster.reduce((sum, c) => sum + (c.retainer || 0), 0);
  const activeCount = roster.filter(c => c.status === 'Active').length;
  const withRetainer = roster.filter(c => c.retainer > 0).length;

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">My Creators</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {brand !== 'all' ? `${brand.replace(/_/g, ' ')} — ` : ''}Your managed talent roster
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Creators</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{roster.length}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Monthly Retainer</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{fmt(totalRetainer)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-green-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Active</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{activeCount}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-[#E91E8C]" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">On Retainer</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{withRetainer}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, handle, or Discord..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
          Loading creators...
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <UserX className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No creators found</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Primary Handle</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Brand</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Discord</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Retainer</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Posts/Mo</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-pink-50/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-[#1A1B3A]">{c.real_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.account_1 ? (
                        <a
                          href={`https://tiktok.com/@${c.account_1}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#E91E8C] hover:underline"
                        >
                          @{c.account_1}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">
                        {c.brand?.replace(/_/g, ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.discord_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {c.retainer > 0 ? fmt(c.retainer) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.monthly_post_requirement || 30}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        c.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.status || 'Active'}
                      </span>
                    </td>
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

export default function RosterPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Loading...</div>}>
      <RosterContent />
    </Suspense>
  );
}
