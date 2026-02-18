'use client';

import { useState, useCallback } from 'react';

/** Hook for managing brand filter selection state */
export function useBrandFilter() {
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  const selectBrand = useCallback((brand: string) => {
    setSelectedBrand(brand);
  }, []);

  const clearFilter = useCallback(() => {
    setSelectedBrand('all');
  }, []);

  return { selectedBrand, selectBrand, clearFilter, isFiltered: selectedBrand !== 'all' };
}
