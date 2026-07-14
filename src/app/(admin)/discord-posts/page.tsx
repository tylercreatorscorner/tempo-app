export const dynamic = 'force-dynamic';

import { DiscordPostsClient } from './client';

export default function DiscordPostsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
          Discord Post Generator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate &ldquo;What&apos;s Cooking&rdquo; and &ldquo;Who&apos;s Cooking&rdquo; posts for Discord
        </p>
      </div>
      <DiscordPostsClient />
    </div>
  );
}
