# Creator removal restoration

The Studio roster editor initialized in edit mode, but rendered its Remove action only after leaving edit mode. Saving first made the action appear; simply opening a creator did not.

The shared Remove creator control now appears in the roster overview, the editor before saving, and the full profile when one brand relationship is selected. The confirmation names that brand, retains drafts on cancellation, and describes archival of one managed-roster record. It does not delete the creator identity, other brand relationships, stored performance, or saved reports. It does not promise that newly calculated historical reports remain unchanged.

The endpoint requires roster write permission, rejects impersonation, and enforces tenant and brand scope. A request with a stale selected brand is rejected. Writes pin the authorized brand and unarchived state; retries preserve the original archive date. UI requests lock against duplicate clicks and ignore responses after unmount or workspace changes.

## Verification

- `npm run test:creator-removal`: actual route with isolated database fixtures, editor integration, and component interactions. Includes allowed and denied roles, foreign tenants/brands, stale row changes, idempotent retry, cancellation, failure/retry, disabled state, malformed responses, and stale asynchronous responses.
- TypeScript and focused ESLint pass.
- Built-in browser: actual components in a local fictional fixture at desktop, 390px and 320px. Confirmation defaults focus to Cancel; Escape returns to the trigger; no horizontal overflow; one simulated successful request closes the drawer. No real creator was removed.
- Live production verification follows deployment, using open/cancel only.
