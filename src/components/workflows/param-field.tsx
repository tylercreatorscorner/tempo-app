'use client';

/**
 * Shared param input renderer — drives both:
 *   - the Automations builder form (one ParamField per action param)
 *   - the per-integration "Test send" form in the drawer
 *
 * Driven entirely by the registry's paramSchema. Adding a new param type
 * (e.g. 'recipient-picker' for SMS phone-book lookup) is one new branch
 * here + one new resolver server-side.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type ParamType = 'text' | 'textarea' | 'channel-picker' | 'number';

export interface ActionParam {
  key: string;
  label: string;
  type: ParamType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  rows?: number;
  defaultValue?: string | number;
}

export interface ChannelOption {
  id: string;
  name: string;
  parentName: string | null;
  isAnnouncement: boolean;
  badge?: string;
}

export function ParamField({
  param, value, onChange, integrationId,
}: {
  param: ActionParam;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Required for channel-picker params — used to fetch options. */
  integrationId?: string;
}) {
  if (param.type === 'channel-picker') {
    return (
      <Field label={param.label} required={param.required}>
        <ChannelPicker
          integrationId={integrationId ?? ''}
          value={String(value ?? '')}
          onChange={onChange}
        />
        {param.helpText && <p className="text-[11px] text-gray-500 mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  if (param.type === 'textarea') {
    return (
      <Field label={param.label} required={param.required}>
        <textarea
          rows={param.rows ?? 3}
          value={String(value ?? param.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] resize-none"
        />
        {param.helpText && <p className="text-[11px] text-gray-500 mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  if (param.type === 'number') {
    return (
      <Field label={param.label} required={param.required}>
        <input
          type="number"
          value={String(value ?? param.defaultValue ?? '')}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={param.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30"
        />
        {param.helpText && <p className="text-[11px] text-gray-500 mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  return (
    <Field label={param.label} required={param.required}>
      <input
        type="text"
        value={String(value ?? param.defaultValue ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30"
      />
      {param.helpText && <p className="text-[11px] text-gray-500 mt-1">{param.helpText}</p>}
    </Field>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
        {label} {required && <span className="text-[#FF4D8D]">*</span>}
      </label>
      {children}
    </div>
  );
}

export function ChannelPicker({
  integrationId, value, onChange,
}: {
  integrationId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [channels, setChannels] = useState<ChannelOption[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!integrationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadErr(null);
      try {
        const res = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/channels`);
        const j = await res.json() as { channels?: ChannelOption[]; error?: string };
        if (cancelled) return;
        if (j.channels) setChannels(j.channels);
        else setLoadErr(j.error ?? 'Failed to load channels');
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [integrationId]);

  const grouped = useMemo(() => {
    if (!channels) return null;
    const map = new Map<string, ChannelOption[]>();
    for (const c of channels) {
      const k = c.parentName ?? 'Uncategorized';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return Array.from(map.entries());
  }, [channels]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        <span className="text-xs text-gray-500">Loading channels…</span>
      </div>
    );
  }
  if (loadErr || !grouped || grouped.length === 0) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="channel id"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30"
        />
        {loadErr && <p className="text-[11px] text-amber-600 mt-1">Couldn&apos;t list channels: {loadErr}. Paste an ID manually.</p>}
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30"
    >
      <option value="">— pick a channel —</option>
      {grouped.map(([category, items]) => (
        <optgroup key={category} label={category}>
          {items.map(c => (
            <option key={c.id} value={c.id}>
              {c.badge ? `${c.badge} ` : c.isAnnouncement ? '📢 ' : '#'}{c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
