'use client';

import { PageError } from '@/components/ui/page-error';

export default function ContestsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="contests" />;
}
