# Subscription billing is deferred

Tempo currently has no active Stripe SDK, checkout flow, paid-plan selection,
subscription onboarding requirement or provider webhook processing. The former
checkout and webhook URLs return HTTP 410 without reading request data or
acquiring database/provider access. Legacy success links redirect to the dashboard.

Existing database columns and migration history are retained. Existing invoice
records, manual payment methods and creator compensation remain operational
features; they do not initiate Stripe payments. Workspace brand limits also remain
administrative controls rather than payment-triggered upgrades.

Before reintroducing paid subscriptions, define actual products and prices,
separate entitlement policy from provider events, implement strict webhook
verification and idempotency, and verify the complete checkout/cancellation/retry
lifecycle in an isolated test environment. Present reviewed billing terms before
enabling paid signup. Do not restore the historical implementation wholesale.

When this removal is deployed, disable any obsolete webhook destination in the
provider dashboard to avoid unnecessary retries. No provider account, remote
configuration, existing data or database schema was changed by this source patch.
