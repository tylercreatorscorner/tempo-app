'use client';

import { PageError } from '@/components/ui/page-error';

export default function YtdError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="year-to-date" />;
}
