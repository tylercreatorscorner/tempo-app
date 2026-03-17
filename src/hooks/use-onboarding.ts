'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  required: boolean;
  complete: boolean;
  href: string;
  icon: string;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  progress: number; // 0-100
  isGated: boolean; // true if required steps incomplete (dashboard locked)
  isComplete: boolean; // all steps done
  loading: boolean;
}

export function useOnboarding(): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>({
    steps: [],
    progress: 0,
    isGated: true,
    isComplete: false,
    loading: true,
  });

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus(s => ({ ...s, loading: false }));
        return;
      }

      // Get tenant info
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.tenant_id) {
        // No profile = new user, show gate but with default steps
        setStatus(s => ({ ...s, loading: false, isGated: true }));
        return;
      }

      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile.tenant_id)
        .single();

      if (!tenant) {
        setStatus(s => ({ ...s, loading: false }));
        return;
      }

      // Check each step
      const tiktokConnected = tenant.tiktok_connected || false;
      const planSelected = !!tenant.stripe_subscription_id;
      const creatorsAdded = tenant.creators_added || false;
      const discordConnected = tenant.discord_connected || false;

      const steps: OnboardingStep[] = [
        {
          id: 'tiktok',
          label: 'Connect TikTok Shop',
          description: 'Add Tempo as a sub-account to sync your data',
          required: true,
          complete: tiktokConnected,
          href: '/settings',
          icon: '🎵',
        },
        {
          id: 'plan',
          label: 'Choose your plan',
          description: 'Select a plan to unlock your full dashboard',
          required: true,
          complete: planSelected,
          href: '/settings',
          icon: '💎',
        },
        {
          id: 'creators',
          label: 'Add managed creators',
          description: 'Upload your managed roster for tracking',
          required: false,
          complete: creatorsAdded,
          href: '/roster',
          icon: '👥',
        },
        {
          id: 'discord',
          label: 'Connect Discord',
          description: 'Enable creator messaging and server analytics',
          required: false,
          complete: discordConnected,
          href: '/settings',
          icon: '💬',
        },
      ];

      const requiredSteps = steps.filter(s => s.required);
      const requiredCompleted = requiredSteps.filter(s => s.complete).length;
      const completed = steps.filter(s => s.complete).length;
      const progress = Math.round((requiredCompleted / requiredSteps.length) * 100);
      const requiredDone = requiredSteps.every(s => s.complete);

      setStatus({
        steps,
        progress,
        isGated: !requiredDone,
        isComplete: completed === steps.length,
        loading: false,
      });
    }

    check();
  }, []);

  return status;
}
