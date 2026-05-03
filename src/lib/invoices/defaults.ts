/**
 * Global invoice defaults — fallback values used when a brand-level setting
 * isn't set. Edit this file to update values across all future invoices.
 *
 * TODO: move to a tenant_settings table when going multi-tenant SaaS.
 */

/**
 * Used when generating an invoice for a brand that has no
 * brand_settings.payment_instructions set. Snapshotted onto the invoice at
 * creation, so future edits to this default don't affect existing invoices.
 *
 * UPDATE THIS to your real wire / ACH / check details before sending real
 * invoices to clients.
 */
export const DEFAULT_PAYMENT_INSTRUCTIONS = `Please remit payment by wire transfer or check.

Wire to:
  Bank: [Your Bank]
  Account name: Creators Corner
  Routing #: [Routing]
  Account #: [Account]

Or pay by check made out to Creators Corner.

Questions? Reply to this email.`;
