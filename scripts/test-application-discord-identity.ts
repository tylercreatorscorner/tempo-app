import assert from 'node:assert/strict';
import { signDiscordIdentity, verifyApplicationDiscordIdentity, verifyDiscordIdentity } from '../src/lib/applications/discord-identity';
import { brandIdSchema } from '../src/lib/applications/schema';

assert.equal(brandIdSchema.safeParse('b0000000-0000-0000-0000-000000000003').success, true);
assert.equal(brandIdSchema.safeParse('not-a-brand-id').success, false);

process.env.APPLICATION_DISCORD_COOKIE_SECRET = 'a-local-test-secret-of-at-least-thirty-two-characters';
const formId = '00000000-0000-4000-8000-000000000007';
const identity = { formId, id: '123456789012345678', username: 'creator', globalName: 'Creator', avatar: null };
const cookie = signDiscordIdentity(identity);
assert.deepEqual(verifyDiscordIdentity(cookie), identity);
assert.deepEqual(verifyApplicationDiscordIdentity(cookie, formId), identity);
assert.equal(verifyApplicationDiscordIdentity(cookie, '00000000-0000-4000-8000-000000000008'), null);
assert.equal(verifyDiscordIdentity(`${cookie.slice(0, -1)}x`), null);
process.env.APPLICATION_DISCORD_COOKIE_SECRET = 'a-different-local-test-secret-of-at-least-thirty-two-characters';
assert.equal(verifyDiscordIdentity(cookie), null);
console.log('application Discord identity signing and form binding: passed');
