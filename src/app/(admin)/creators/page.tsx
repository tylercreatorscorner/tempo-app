import { redirect } from 'next/navigation';

// The old /creators list page has been consolidated into /roster (My Creators)
// which has both a Managed Roster tab and an All Creators tab.
export default function CreatorsPage() {
  redirect('/roster');
}
