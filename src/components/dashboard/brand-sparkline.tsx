'use client';

import { formatCurrency } from '@/lib/utils/format';
import { Sparkline } from '@/components/charts/sparkline';

/**
 * Currency-formatted Sparkline for the Brand Performance rows.
 *
 * Exists purely to hold the server/client boundary: BrandPerformance is an async
 * SERVER component, Sparkline is 'use client', and its `format` prop is a
 * function — which cannot cross that boundary (it isn't serializable, and Next
 * throws at runtime, not at typecheck). So the formatter is bound here, on the
 * client side, and the server only ever passes plain data across.
 */
export function BrandSparkline({
  data,
  days,
  color,
}: {
  data?: number[];
  days?: string[];
  color?: string | null;
}) {
  return (
    <Sparkline
      data={data}
      days={days}
      color={color ?? 'var(--primary)'}
      width={88}
      height={26}
      format={formatCurrency}
    />
  );
}
