import { redirect } from 'next/navigation';

// Invites moved into Settings → Creator Invites card. Keep this route as a
// redirect so any old bookmarks / tabs still land in the right place.
export default function InvitesPage() {
  redirect('/settings#invites');
}
