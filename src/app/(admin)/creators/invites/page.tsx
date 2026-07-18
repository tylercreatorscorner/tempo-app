import { InvitesClient } from './invites-client';

/**
 * Admin control panel for distributing creator-portal invite links over Discord.
 * Gated by the (admin) layout; the API it calls is independently requireAdmin-gated.
 */
export default function CreatorInvitesPage() {
  return <InvitesClient />;
}
