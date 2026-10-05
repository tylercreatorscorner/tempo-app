'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { selectMonthTerms, validateClientSaveInput, type AgencyTerms, type ClientRecord } from '@/lib/agency/model';
import styles from './agency.module.css';

export function QuickClientSetup({ clients, month, onSaved, onEdit }: { clients: ClientRecord[]; month: string; onSaved: (client: ClientRecord) => void; onEdit: (client: ClientRecord) => void }) {
  if (!clients.length) return null;
  return <section className={styles.quickSetup} aria-label="Quick client setup"><h2>Quick setup <span className={styles.count}>{clients.length}</span></h2><p>Complete clients here without opening each editor. New terms apply from {month}; $0 is a confirmed zero fee when you save. Save each row before switching months or leaving this page. Earlier and future agreements are preserved.</p><div className={styles.quickScroll}><div className={styles.quickRows}>{clients.map(client => <SetupRow key={`${client.id}:${client.revision}`} client={client} month={month} onSaved={onSaved} onEdit={onEdit} />)}</div></div></section>;
}

function SetupRow({ client, month, onSaved, onEdit }: { client: ClientRecord; month: string; onSaved: (client: ClientRecord) => void; onEdit: (client: ClientRecord) => void }) {
  const existing = selectMonthTerms(client.terms, month);
  const [start, setStart] = useState(client.serviceStart ?? '');
  const [model, setModel] = useState<AgencyTerms['feeModel']>('fixed');
  const [fee, setFee] = useState('0');
  const [share, setShare] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    try {
      if (!start) throw new Error('Enter the actual service start date.');
      const terms = existing ? client.terms : [...client.terms, { effectiveMonth: month, monthlyRetainer: model === 'share' ? 0 : Number(fee), revSharePercent: model === 'fixed' ? 0 : Number(share), feeModel: model }];
      const payload = validateClientSaveInput({ id: client.id, expectedRevision: client.revision, name: client.name, brandIds: client.brandIds, serviceStart: start, serviceEnd: client.serviceEnd, exitReason: client.exitReason, terms });
      setSaving(true);
      controller.current = new AbortController();
      const response = await fetch('/api/agency/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.current.signal });
      const saved = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? 'This client changed. Open the detailed editor to review the latest saved version before retrying.' : saved?.error || 'Could not save. Your inputs are preserved.');
      if (!saved?.id || !Number.isInteger(saved.revision)) throw new Error('Save could not be verified. Refresh before retrying.');
      if (alive.current) onSaved(saved as ClientRecord);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not save.'); }
    finally { if (alive.current) setSaving(false); }
  }
  return <form className={styles.quickRow} onSubmit={save} aria-label={`Set up ${client.name}`}><div><strong>{client.name}</strong><button type="button" className={styles.textButton} disabled={saving} onClick={() => onEdit(client)}>Details & history</button></div><label className={styles.field}><span>Service start</span><DateField aria-label={`${client.name} service start`} value={start} onValueChange={setStart} max={client.serviceEnd ?? undefined} disabled={saving} /></label>{existing ? <div className={styles.help}>Existing terms preserved<br />Use Details & history to change fees.</div> : <><div className={styles.field}><span>Fee model</span><ChoiceMenu compact label={`${client.name} fee model`} value={model} options={[{value:'fixed',label:'Fixed fee'},{value:'share',label:'Revenue share'},{value:'additive',label:'Fee + share'},{value:'minimum',label:'Minimum guarantee'}]} onChange={value => setModel(value as AgencyTerms['feeModel'])} disabled={saving} /></div><div className={styles.fieldPair}>{model !== 'share' && <label className={styles.field}><span>Monthly fee $</span><Input aria-label={`${client.name} monthly fee`} type="number" inputMode="decimal" min="0" max="100000000" step="0.01" value={fee} onChange={event => setFee(event.target.value)} disabled={saving} /></label>}{model !== 'fixed' && <label className={styles.field}><span>Share %</span><Input aria-label={`${client.name} revenue share`} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={share} onChange={event => setShare(event.target.value)} disabled={saving} /></label>}</div></>}<button type="submit" className={styles.secondaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{error && <p className={styles.quickError} role="alert">{error}</p>}</form>;
}
