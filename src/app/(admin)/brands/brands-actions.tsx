'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddBrandModal } from '@/components/brands/add-brand-modal';
import { Button } from '@/components/ui/button';

export function BrandsActions() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowAdd(true)}
      >
        <Plus className="h-4 w-4" /> Add Brand
      </Button>
      <AddBrandModal open={showAdd} onClose={() => setShowAdd(false)} />
    </>
  );
}
