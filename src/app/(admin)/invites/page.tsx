export const dynamic = 'force-dynamic';

'use client';

import { useState, useEffect } from 'react';
import { Copy, Plus, Check } from 'lucide-react';

interface Invite {
  id: string;
  brand: string;
  code: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  active: boolean;
  created_at: string;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [brand, setBrand] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Load invites on mount
  useEffect(() => {
    // We don't have a list API yet so this is a placeholder
  }, []);

  const createInvite = async () => {
    if (!brand.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand.trim(), tenant_id: TENANT_ID }),
      });
      const data = await res.json();
      if (data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
        setBrand('');
      }
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Invite Creators</h1>
        <p className="text-gray-500 mt-1">Generate invite links for creators to join a brand</p>
      </div>

      {/* Create invite */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-[#1A1B3A] mb-4">Generate New Invite</h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Brand name (e.g. physicians_choice)"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
          />
          <button
            onClick={createInvite}
            disabled={creating || !brand.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Generate
          </button>
        </div>
      </div>

      {/* Invite list */}
      {invites.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-[#1A1B3A] mb-4">Active Invites</h3>
          <div className="space-y-3">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl">
                <div>
                  <p className="font-medium text-sm text-[#1A1B3A]">{inv.brand}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Code: {inv.code} | Used: {inv.current_uses}/{inv.max_uses} |
                    Expires: {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(inv.code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {copied === inv.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-600">Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
