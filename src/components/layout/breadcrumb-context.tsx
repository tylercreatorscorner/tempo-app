'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface BreadcrumbContextValue {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  label: null,
  setLabel: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ label, setLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbOverride() {
  return useContext(BreadcrumbContext);
}

/**
 * Server pages can render this to push a custom breadcrumb label into the header.
 * Mount → sets the label; unmount → clears it.
 */
export function SetBreadcrumb({ label }: { label: string }) {
  const { setLabel } = useBreadcrumbOverride();
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
  return null;
}
