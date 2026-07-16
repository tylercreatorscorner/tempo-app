'use client';

import { PageError } from '@/components/ui/page-error';

export default function RetentionError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="retention" />;
}
