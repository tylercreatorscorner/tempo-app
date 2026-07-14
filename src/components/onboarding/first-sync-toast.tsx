'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PartyPopper, X } from 'lucide-react';

/** Shows a celebration toast when ?plan_activated=true or first data appears */
export function FirstSyncToast() {
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (params.get('plan_activated') === 'true') {
      setMessage("Your plan is active! You're all set.");
      setShow(true);
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [params]);

  if (!show) return null;

  return (
    <>
      {/* Confetti */}
      <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden" aria-hidden>
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-8px',
              backgroundColor: ['var(--primary)', 'var(--pulse-accent-2)', '#00F2EA', '#FFD700', '#00FF88', '#FF6B35'][i % 6],
              animation: `confetti-fall ${2 + Math.random() * 2}s ease-in forwards`,
              animationDelay: `${Math.random() * 1.5}s`,
            }}
          />
        ))}
      </div>

      {/* Toast */}
      <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-card border border-border shadow-xl max-w-sm">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center shrink-0">
            <PartyPopper className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">🎉 {message}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Welcome to Tempo</p>
          </div>
          <button
            onClick={() => setShow(false)}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}
