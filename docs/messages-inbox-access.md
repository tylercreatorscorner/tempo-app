# Legacy inbox access and delivery

This policy applies to `/api/messages` and the legacy Inbox. The separate Messages V1 operator workspace keeps its existing exact-user access and manual Discord handoff; this change does not enable its send endpoint.

- Every data query is constrained to the resolved workspace tenant and messaging capability. Writes also deny impersonation and require same-origin requests.
- Full-tenant readers may see tenant-owned canonical creator, legacy roster, or verified Discord history. A creator UUID supplied with a Discord ID must match the creator's stored Discord identity.
- Brand-scoped readers may see only messages whose legacy integer `creator_id` resolves to one of their assigned brand records. Canonical UUID and Discord-only messages have no brand attribution and cannot widen that history, even when the creator works for multiple brands. Mark-read uses the same boundary.
- A directly assigned child/store brand remains available in the inbox without implicitly granting its parent roster or message history. Scoped lists keep canonical creator profiles separate even if they share Discord; `conversation_key` preserves that same identity in list selection and read state.
- A scoped send requires exactly one permitted legacy roster record. Zero or multiple matches return an explicit denial before contacting Discord. Successful sends retain that legacy record alongside the canonical `creator_uuid` so the sender can read the resulting history.
- The diagnostic endpoint requires owner/admin, full brand scope, messaging read/write permission and a verified creator in the caller's tenant. It no longer targets arbitrary Discord accounts or logs unowned rows.
- Discord consent is checked immediately before delivery. Missing account/token, opt-out, consent read failure and explicit delivery rejection never return a delivered message. An uncertain transport result warns against retrying blindly. Confirmed delivery followed by a log failure returns a delivered message plus a do-not-resend warning.
- Inbox roster, account, legacy-identity and history reads paginate beyond the database's default row cap. Scoped history filters are applied in the database and identifier lists are batched. Seven-day metric errors produce null values and an unavailable status while conversations remain usable. The isolated creator-context panel returns an explicit load error on failed metrics.
- Umbrella-brand performance includes its verified tenant-owned store data, following the existing reporting data grain. Other brands and tenants are excluded. Metrics remain observed seven-day record totals, not a guarantee of source-day coverage.

`scripts/test-message-invite-access.mjs` runs handlers against fixtures with no network delivery or live mutations. It covers capability/tenant/brand denial, shared creator history, brand-limited read updates, more than 1,000 roster/account/legacy records, stable newest-first pagination, error masking, delivery/consent failures, ambiguous scoped sends, diagnostic restrictions and active tenant-owned invite generation. It also checks umbrella store metrics and that metric failure does not erase conversations.

## Existing data limitation

A read-only aggregate check on November 10, 2026 found zero CC `creator_messages` rows carrying the trusted tenant ID, plus 32 rows with a null tenant and a possible CC creator identity. These unowned rows remain excluded. This change does not infer ownership, backfill records, migrate data, repair inbound capture, or send messages. Any historical repair requires a reviewed mapping. Production delivery and credentials were not exercised by the fixture tests.
