'use client';

import { PageError } from '@/components/ui/page-error';

export default function SegmentsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="segments" />;
}
