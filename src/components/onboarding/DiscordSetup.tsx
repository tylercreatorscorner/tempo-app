'use client';

import { useState, useEffect } from 'react';
import { Bot, ExternalLink, CheckCircle2, Loader2, MessageSquare, Bell, DollarSign } from 'lucide-react';

const DISCORD_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=TEMPO_BOT_ID&permissions=2147485696&scope=bot%20applications.commands';

interface DiscordSetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function DiscordSetup({ onComplete, onSkip }: DiscordSetupProps) {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected'>('idle');
  const [serverName, setServerName] = useState('');

  // Mock polling - in production this would check the API
  useEffect(() => {
    if (status !== 'waiting') return;
    const timer = setTimeout(() => {
      setServerName('My Brand Server');
      setStatus('connected');
    }, 5000);
    return () => clearTimeout(timer);
  }, [status]);

  function handleInviteClick() {
    window.open(DISCORD_INVITE_URL, '_blank');
    setStatus('waiting');
  }

  if (status === 'connected') {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex h-16 w-16 rounded-full bg-green-100 items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Tempo Bot is connected!</h3>
          <p className="text-muted-foreground mt-1">
            Connected to <span className="font-semibold text-foreground">{serverName}</span>
          </p>
        </div>
        <button
          onClick={onComplete}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex h-16 w-16 rounded-2xl bg-[#5865F2] items-center justify-center mb-3">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-xl font-bold">Add Tempo Bot to Discord</h3>
        <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
          Connect your Discord server to get creator notifications, messaging relay, and retainer reminders.
        </p>
      </div>

      {/* What the bot does */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-md mx-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What Tempo Bot does</p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-[var(--primary)] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Messaging Relay</p>
              <p className="text-xs text-muted-foreground">Send and receive creator messages from Discord</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-[var(--pulse-accent-2)] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Creator Notifications</p>
              <p className="text-xs text-muted-foreground">Get alerts when creators post, hit milestones, or need attention</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-[#00F2EA] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Retainer Reminders</p>
              <p className="text-xs text-muted-foreground">Automatic reminders for creator retainer payments</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        {status === 'waiting' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#5865F2]" />
            Waiting for bot to join your server...
          </div>
        ) : (
          <button
            onClick={handleInviteClick}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#5865F2] text-white font-semibold text-lg hover:bg-[#4752C4] transition-colors shadow-lg"
          >
            <Bot className="h-5 w-5" />
            Add Tempo Bot
            <ExternalLink className="h-4 w-4 opacity-60" />
          </button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          🔜 <span className="font-medium">Slack integration coming soon!</span>
        </p>

        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Skip for now — you can add this later in Settings
        </button>
      </div>
    </div>
  );
}
