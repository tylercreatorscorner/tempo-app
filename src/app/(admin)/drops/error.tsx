'use client';

import { PageError } from '@/components/ui/page-error';

export default function DropsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="drops" />;
}
