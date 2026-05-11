'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Users, Filter, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandList } from '@/hooks/use-brand-list';
import { ALL_STATUSES, STATUS_CONFIG, type CreatorStatus } from '@/lib/data/creator-status';
import { ChannelIcon } from './channel-icon';

interface Creator {
  id: number;
  real_name: string;
  brand: string;
  discord_id: string | null;
  status?: CreatorStatus;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'filters' | 'preview' | 'compose' | 'confirm';

export function BulkMessageModal({ open, onClose }: Props) {
  const { brands: brandOptions } = useBrandList();
  const [step, setStep] = useState<Step>('filters');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilters, setStatusFilters] = useState<Set<CreatorStatus>>(new Set(ALL_STATUSES));
  const [hasDiscord, setHasDiscord] = useState<'all' | 'yes' | 'no'>('all');

  // Message
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (brandFilter !== 'all') params.set('brand', brandFilter);
      params.set('statuses', [...statusFilters].join(','));
      if (hasDiscord !== 'all') params.set('has_discord', hasDiscord);

      const res = await fetch(`/api/messages/bulk/creators?${params}`);
      const data = await res.json();
      setCreators(data.creators ?? []);
    } catch {
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, [brandFilter, statusFilters, hasDiscord]);

  useEffect(() => {
    if (open) fetchCreators();
  }, [open, fetchCreators]);

  if (!open) return null;

  const toggleStatus = (s: CreatorStatus) => {
    const next = new Set(statusFilters);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilters(next);
  };

  const filtered = creators.filter(c => {
    if (hasDiscord === 'yes' && !c.discord_id) return false;
    if (hasDiscord === 'no' && c.discord_id) return false;
    return true;
  });

  const handleSend = async () => {
    if (!content.trim() || filtered.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorIds: filtered.map(c => c.id),
          content: content.trim(),
        }),
      });
      const data = await res.json();
      setResult(`Sent to ${data.queued} creators`);
      setStep('filters');
      setContent('');
    } catch {
      setResult('Failed to send bulk messages');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setStep('filters');
    setContent('');
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
              <Users className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1B3A]">Bulk Message</h3>
              <p className="text-xs text-gray-400">
                {step === 'filters' && 'Select your audience'}
                {step === 'preview' && `${filtered.length} creators matched`}
                {step === 'compose' && 'Write your message'}
                {step === 'confirm' && 'Review and send'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step: Filters */}
        {step === 'filters' && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Brand filter */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</label>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => setBrandFilter('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    brandFilter === 'all'
                      ? 'border-pink-300 bg-pink-50 text-pink-600'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                >
                  All Brands
                </button>
                {brandOptions.map(b => (
                  <button
                    key={b.slug}
                    onClick={() => setBrandFilter(b.slug)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      brandFilter === b.slug
                        ? 'text-white'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                    style={brandFilter === b.slug ? {
                      backgroundColor: b.color,
                      borderColor: b.color,
                    } : undefined}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Creator Status</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ALL_STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = statusFilters.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5',
                        active
                          ? 'border-transparent'
                          : 'border-gray-200 text-gray-400 opacity-50'
                      )}
                      style={active ? {
                        backgroundColor: cfg.bgColor,
                        color: cfg.color,
                        borderColor: cfg.color + '40',
                      } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? cfg.dotColor : '#d1d5db' }} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Discord filter */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Discord Connected</label>
              <div className="flex gap-2 mt-2">
                {[
                  { value: 'all' as const, label: 'All' },
                  { value: 'yes' as const, label: 'Has Discord' },
                  { value: 'no' as const, label: 'No Discord' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setHasDiscord(opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      hasDiscord === opt.value
                        ? 'border-[#5865F2] bg-[#EEF0FE] text-[#5865F2]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-[#1A1B3A]">
                  {loading ? '...' : `${filtered.length} creators`} match your filters
                </span>
              </div>
              <button
                onClick={() => setStep('preview')}
                disabled={filtered.length === 0 || loading}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Preview
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">{filtered.length} creators will receive this message</span>
              <button onClick={() => setStep('filters')} className="text-xs text-pink-500 hover:text-pink-700">
                Edit filters
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-6 py-2.5 border-b border-gray-50 hover:bg-gray-50/50">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: brandOptions.find(b => b.slug === c.brand)?.color || '#6B7280' }}
                  >
                    {c.real_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-[#1A1B3A]">{c.real_name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {brandOptions.find(b => b.slug === c.brand)?.name || c.brand}
                    </span>
                  </div>
                  {c.discord_id ? (
                    <ChannelIcon channel="dm" size="sm" showLabel />
                  ) : (
                    <span className="text-[10px] text-gray-400">No Discord</span>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => setStep('filters')}
                className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('compose')}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Write Message
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Compose */}
        {step === 'compose' && (
          <div className="flex-1 px-6 py-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <ChannelIcon channel="bulk" size="sm" showLabel />
              <span className="text-xs text-gray-400">Sending to {filtered.length} creators</span>
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Type your message..."
              rows={6}
              className="flex-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
              autoFocus
            />
            <div className="flex justify-between mt-4">
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={!content.trim()}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Review
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <div className="flex-1 px-6 py-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Send to {filtered.length} creators?
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Messages will be sent at a rate of 1 per second. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Message Preview</p>
              <p className="text-sm text-[#1A1B3A] whitespace-pre-wrap">{content}</p>
            </div>

            {result && (
              <div className={cn(
                'rounded-xl p-3 text-sm',
                result.startsWith('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              )}>
                {result}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep('compose')}
                className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {filtered.length} creators
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
