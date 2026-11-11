# Onboarding audit, November 10, 2026

## Scope and behavior

Audits the shipped direct invitation workflow at `/roster/invitations` and `/join/[code]`, plus the legacy creator-portal invitation tool. This does not enable the separate Creator Hub preview, Discord onboarding, automatic approval, or outbound messages.

- Onboarding uses the shared Studio shell, compact controls, responsive cards, and its own loading/error views.
- Brand selection updates the URL, resets pending-list pagination, and carries through to the creator roster link. Creating a link locks its brand and rejects duplicate clicks or malformed success responses.
- Copy failures show a selectable URL. Generated links are explicitly session-only in the UI; expiry and usage limits remain enforced on the server.
- Pending creator details are tenant-scoped, brand-filtered, and paginated. They include any Applied/non-managed record, not only invite submissions. Review links open existing creator profiles; this list does not approve identities or establish managed roster membership.
- The public form resets between invite codes, ignores stale validation, locks pending submissions, preserves input on errors, and states review is pending. It does not claim an email was sent or access was granted.

## Permissions and data safety

Invitation management retains its existing owner/admin, all-brand, roster-read/write policy. Scoped managers, missing capabilities, and impersonation cannot generate creator-portal credentials. Legacy searches, eligibility, batches, counts, and minting now enforce tenant ownership.

Only exact public validation GET and redemption POST routes bypass staff sign-in. Public invite responses contain the brand name, not tenant or applicant details. Same-origin JSON and bounded input checks apply to redemption.

Migration `20261111014615_atomic_creator_invite_registration.sql` installs a SECURITY INVOKER, server-only registration transaction. It derives tenant and active brand from the locked invitation, checks usage and expiry, rejects existing emails and canonical/legacy claimed handles, then creates unverified Applied records and increments usage atomically. It never upserts an existing identity. Existing global email uniqueness remains intact and returns a generic review-required conflict.

The migration was applied and its ACL read back: anon/authenticated cannot execute, service_role can. Live table columns and uniqueness matched the migration. Security advisors reported no new findings. No existing creator records were modified by this audit.

## Validation

- `test:onboarding`: actual migration in PGlite, route/middleware permissions, public-form races and retries, legacy access boundaries, pending-list tenant/brand isolation and pagination.
- `test:operations-workspace`: generate/copy controls, brand URL handoff, duplicate prevention, malformed responses, and existing workspace regressions.
- Creator-token tests retain valid token purpose/consumption and test the explicit authorization boundary before minting.
- Local browser checks use intercepted fictional data only: generation, clipboard failure, brand selector, Back, add/remove account, and form submission at mobile widths down to 320px.
- PGlite last-slot tests exercise transaction semantics; they do not claim a live multi-session concurrency test.
- Automatic approval review declined a live registration probe because it could write business records. Production checks therefore remain read-only; successful registration and rollback are validated in the isolated database fixture.

No invitations, emails, Discord messages, approvals, or real test applicants were sent or created.
