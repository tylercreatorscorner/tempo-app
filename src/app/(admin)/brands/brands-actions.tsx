'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddBrandModal } from '@/components/brands/add-brand-modal';

export function BrandsActions() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowAdd(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20"
      >
        <Plus className="h-4 w-4" /> Add Brand
      </button>
      <AddBrandModal open={showAdd} onClose={() => setShowAdd(false)} />
    </>
  );
}
