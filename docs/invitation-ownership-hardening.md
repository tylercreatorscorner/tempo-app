# Invitation ownership hardening

Both team invitations and client onboarding use inviteWorkspaceMember. It derives the current owner/admin tenant, resolves Auth identities across pages, rejects foreign/owner/self profiles, and invokes a service-only provisioning transaction. That transaction repeats authority and email checks, locks rows, preserves tenant ownership, clears stale role_id for team role changes, and adds client access without replacing existing assignments or changing an existing contact role. Plain profile INSERT fails on a competing signup instead of overwriting it.

New Auth accounts are created without confirming email and without mail; signInWithOtp is requested after provisioning. Mail failure explicitly reports that access is saved and the email can be resent. No real messages or records were created during verification.

Typecheck, targeted lint, full test:ci and isolated real PostgreSQL tests passed. Immutable-source reproduction confirms both prior entry points moved foreign profiles. Fixtures verify ownership denial, paginated lookup, supported invitations, coach finance, target/signup races, additive contact access, mail order, and client function-grant denial. Independent review found no confirmed ownership defect.

Release verification pending: deployed signup and magic-link email templates must support the intended OTP/TokenHash handoff. SSR discards the initiating PKCE verifier; a default ConfirmationURL link would not exchange successfully in the recipient's browser. The Supabase dashboard requires sign-in, requested from the user. Do not deploy this candidate until that compatibility check is resolved. Migration has not been applied.

References: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://supabase.com/docs/reference/javascript/auth-admin-createuser
