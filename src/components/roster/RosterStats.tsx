'use client';

import { Users, DollarSign, UserCheck, Pause } from 'lucide-react';

interface RosterEntry {
  status: string;
  retainer_amount: number | null;
  retainer_period: string;
}

export function RosterStats({ roster }: { roster: RosterEntry[] }) {
  const total = roster.length;
  const active = roster.filter((r) => r.status === 'active').length;
  const paused = roster.filter((r) => r.status === 'paused').length;

  const monthlySpend = roster
    .filter((r) => r.status === 'active' && r.retainer_amount)
    .reduce((sum, r) => {
      const amt = r.retainer_amount ?? 0;
      if (r.retainer_period === 'weekly') return sum + amt * 4;
      if (r.retainer_period === 'yearly') return sum + amt / 12;
      return sum + amt; // monthly default
    }, 0);

  const stats = [
    {
      label: 'Total Managed',
      value: total.toString(),
      icon: Users,
      iconBg: 'bg-primary/10',
      iconColor: 'text-[#E91E8C]',
    },
    {
      label: 'Monthly Retainer Spend',
      value: `$${monthlySpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      label: 'Active',
      value: active.toString(),
      icon: UserCheck,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Paused',
      value: paused.toString(),
      icon: Pause,
      iconBg: 'bg-yellow-50',
      iconColor: 'text-yellow-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-card border border-border shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`h-9 w-9 rounded-xl ${s.iconBg} flex items-center justify-center`}>
              <s.icon className={`h-4 w-4 ${s.iconColor}`} />
            </div>
            <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
