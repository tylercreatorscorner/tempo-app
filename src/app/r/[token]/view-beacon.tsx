'use client';

/**
 * Stamps viewed_at from the CLIENT, not the server render: pasting the link
 * into Slack/iMessage/WhatsApp makes the platform's unfurl bot GET the page
 * immediately, and a server-side stamp would mark the report "Viewed" before
 * the client ever opened it. Bots don't execute JS, so only a real browser
 * render fires this. The endpoint's .is('viewed_at', null) guard keeps the
 * first real timestamp; firing again on later opens is a no-op.
 */
import { useEffect } from 'react';

export function ViewBeacon({ token, preview }: { token: string; preview: boolean }) {
  useEffect(() => {
    if (preview) return; // operator checking their own link
    fetch(`/api/report-viewed/${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  }, [token, preview]);
  return null;
}
