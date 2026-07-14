'use client';

import { useState } from 'react';
import { Copy, CheckCircle2, Music2, Shield, Info, ExternalLink } from 'lucide-react';

interface TikTokConnectProps {
  companyName?: string;
  connected?: boolean;
}

export function TikTokConnect({ companyName, connected }: TikTokConnectProps) {
  const [copied, setCopied] = useState(false);

  const brandSlug = (companyName || 'mybrand').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dataEmail = `${brandSlug}@tempoapp.ai`;

  function copyEmail() {
    navigator.clipboard.writeText(dataEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (connected) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900">TikTok Shop Connected</h3>
            <p className="text-sm text-green-700">Your data is syncing automatically</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#00F2EA] via-black to-[#FF0050] flex items-center justify-center">
          <Music2 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold">Connect TikTok Shop</h3>
          <p className="text-sm text-muted-foreground">Add Tempo as a sub-account for automatic data sync</p>
        </div>
      </div>

      {/* Data email */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-[var(--pulse-accent-2)] mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">Your data collection email:</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
          <code className="text-sm font-mono font-semibold flex-1 truncate">{dataEmail}</code>
          <button onClick={copyEmail} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How to connect</p>
        <ol className="text-sm text-muted-foreground space-y-2.5">
          <li className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Go to <strong className="text-foreground">TikTok Shop Seller Center</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>Navigate to <strong className="text-foreground">Settings → Account → Sub-accounts</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Click <strong className="text-foreground">&quot;Add Sub-account&quot;</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0">4</span>
            <span>Enter the email above as an <strong className="text-foreground">Affiliate Manager</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold shrink-0">5</span>
            <span>Click &quot;Invite&quot; — we&apos;ll auto-accept within minutes</span>
          </li>
        </ol>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Read-only access</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-[var(--pulse-accent-2)]" />
          <span>Encrypted & isolated</span>
        </div>
      </div>

      <a
        href="https://seller-us.tiktok.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-black/80 transition-colors"
      >
        <Music2 className="h-4 w-4 text-[#00F2EA]" />
        Open TikTok Seller Center
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
