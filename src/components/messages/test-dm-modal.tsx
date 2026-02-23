'use client';

import { useState } from 'react';
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TestDmModal({ open, onClose }: Props) {
  const [discordId, setDiscordId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null);

  if (!open) return null;

  const handleSend = async () => {
    if (!discordId.trim() || !message.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/messages/test-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordUserId: discordId.trim(), content: message.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        setResult({ success: true, text: 'DM sent successfully!' });
        setMessage('');
      } else {
        setResult({ success: false, text: data.error || 'Failed to send. Make sure the bot shares a server with that user.' });
      }
    } catch {
      setResult({ success: false, text: 'Network error. Try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#1A1B3A]">Test DM</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Discord User ID</label>
            <input
              type="text"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="e.g. 131571520597262336"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">Right-click a user in Discord → Copy User ID</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your test message..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
              }}
            />
          </div>

          {result && (
            <div className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
              result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}>
              {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {result.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !discordId.trim() || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Test DM
          </button>
        </div>
      </div>
    </div>
  );
}
