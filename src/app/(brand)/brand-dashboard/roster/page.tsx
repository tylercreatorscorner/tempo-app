'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Upload, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { RosterStats } from '@/components/roster/RosterStats';
import { RosterTable } from '@/components/roster/RosterTable';
import { AddCreatorModal } from '@/components/roster/AddCreatorModal';
import { BulkUploadModal } from '@/components/roster/BulkUploadModal';

// TODO: Replace with actual tenant/brand context from auth
const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const DEMO_BRAND_ID = undefined;

export default function RosterPage() {
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tenant_id: DEMO_TENANT_ID });
      if (DEMO_BRAND_ID) params.set('brand_id', DEMO_BRAND_ID);
      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/brand-dashboard"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">Managed Roster</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Creators on retainer — your managed talent roster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Creator
          </button>
        </div>
      </div>

      {/* Stats */}
      <RosterStats roster={roster} />

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
          Loading roster...
        </div>
      ) : (
        <RosterTable roster={roster} onRefresh={fetchRoster} />
      )}

      {/* Modals */}
      {showAdd && (
        <AddCreatorModal
          tenantId={DEMO_TENANT_ID}
          brandId={DEMO_BRAND_ID}
          onClose={() => setShowAdd(false)}
          onSuccess={fetchRoster}
        />
      )}
      {showBulk && (
        <BulkUploadModal
          tenantId={DEMO_TENANT_ID}
          brandId={DEMO_BRAND_ID}
          onClose={() => setShowBulk(false)}
          onSuccess={fetchRoster}
        />
      )}
    </div>
  );
}
