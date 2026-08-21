/**
 * /discord-posts — permanent redirect to /drops.
 *
 * The creator-post formats moved to the Drops board (Creators → Drops) in
 * 48b7091. This page was left behind, unlinked from any nav but still
 * rendering, so an old bookmark landed on a stale copy that could quietly
 * diverge from the live board. That is exactly what happened on 2026-08-20.
 *
 * A redirect rather than a deletion: the URL is in bookmarks and pasted links,
 * and sending those to /drops is more useful than a 404. Three lines is not
 * dead weight; a second implementation of the same screen was.
 */
import { redirect } from 'next/navigation';

export default function DiscordPostsRedirect() {
  redirect('/drops');
}
