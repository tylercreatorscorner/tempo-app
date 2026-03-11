export const dynamic = 'force-dynamic';

import { DiscordPostsClient } from './client';

export default function DiscordPostsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1A1B3A]">
          Discord Post Generator
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate &ldquo;What&apos;s Cooking&rdquo; and &ldquo;Who&apos;s Cooking&rdquo; posts for Discord
        </p>
      </div>
      <DiscordPostsClient />
    </div>
  );
}
