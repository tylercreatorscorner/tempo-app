'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function usePlatformAdmin() {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('platform_admins').select('user_id').maybeSingle().then(({ data }) => {
      setIsPlatformAdmin(!!data);
      setLoading(false);
    });
  }, []);

  return { isPlatformAdmin, loading };
}
