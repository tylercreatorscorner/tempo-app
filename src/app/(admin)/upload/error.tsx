'use client';

import { PageError } from '@/components/ui/page-error';

export default function DataPipelineError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} what="the data pipeline" />;
}
