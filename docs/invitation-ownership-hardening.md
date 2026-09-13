# Invitation ownership hardening

Both team invitations and client onboarding use inviteWorkspaceMember. It derives the current owner/admin tenant, resolves Auth identities across pages, rejects foreign/owner/self profiles, and invokes a service-only provisioning transaction. That transaction repeats authority and email checks, locks rows, preserves tenant ownership, clears stale role_id for team role changes, and adds client access without replacing existing assignments or changing an existing contact role. Plain profile INSERT fails on a competing signup instead of overwriting it.

New accounts retain the established Auth inviteUserByEmail flow and invite template. That operation sends the invitation while creating the identity; profile provisioning follows and fails closed on a competing signup. Existing accounts pass ownership checks and provisioning before requesting their established sign-in email. No new OTP or PKCE handoff is introduced. An invitation may already have been delivered if new-account provisioning fails; the UI reports failure and never overwrites a conflicting profile. No real messages or records were created during verification.

Typecheck, targeted lint, full test:ci and isolated real PostgreSQL tests passed. Immutable-source reproduction confirms both prior entry points moved foreign profiles. Fixtures verify ownership denial, paginated lookup, supported invitations, coach finance, target/signup races, additive contact access, mail order, and client function-grant denial. Independent review found no confirmed ownership defect.

The prior candidate used createUser plus OTP for new accounts, which required unverified email-template compatibility. That candidate was never deployed. This revision preserves the production invite flow instead. The existing resend/sign-in OTP flow still needs a separate compatibility check; it is not claimed fixed here.

References: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
