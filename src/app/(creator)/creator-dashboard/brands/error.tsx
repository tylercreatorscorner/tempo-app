'use client';

import { PageError } from '@/components/ui/page-error';

export default function MyBrandsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="your brands" />;
}
