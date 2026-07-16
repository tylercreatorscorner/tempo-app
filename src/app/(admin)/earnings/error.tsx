'use client';

import { PageError } from '@/components/ui/page-error';

export default function EarningsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="earnings" />;
}
