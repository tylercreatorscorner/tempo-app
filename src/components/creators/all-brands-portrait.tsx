'use client';
import { useEffect, useState } from 'react';
import { BrandPortrait } from './brand-portrait';

export function AllBrandsPortrait({ size = 30 }: { size?: number }) {
  const [identity, setIdentity] = useState<{ name: string; logo: string | null } | null>(null);
  useEffect(() => {
    let controller: AbortController;
    function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setIdentity(null);
      fetch('/api/workspace-identity', { signal: request.signal }).then(res => res.ok ? res.json() : null).then(data => {
        if (!request.signal.aborted) setIdentity(data);
      }).catch(() => {});
    }
    load();
    window.addEventListener('workspace-context-changed', load);
    return () => { controller.abort(); window.removeEventListener('workspace-context-changed', load); };
  }, []);
  return <BrandPortrait name={identity?.name ?? 'All Brands'} source={identity?.logo} size={size} />;
}
