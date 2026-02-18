'use client';

import { useTenant } from '@/hooks/use-tenant';

interface MultiBrandOnlyProps {
  children: React.ReactNode;
  /** Optional fallback for single-brand tenants */
  fallback?: React.ReactNode;
}

/**
 * Renders children only when the current tenant has multiple brands (agency/enterprise).
 * Single-brand tenants see the fallback (or nothing).
 */
export function MultiBrandOnly({ children, fallback = null }: MultiBrandOnlyProps) {
  const { isMultiBrand, loading } = useTenant();

  if (loading) return null;
  return isMultiBrand ? <>{children}</> : <>{fallback}</>;
}
