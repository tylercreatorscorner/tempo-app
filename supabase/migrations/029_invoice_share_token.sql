-- 029_invoice_share_token.sql
--
-- Adds a public share token to invoices. When set, the token grants
-- read-only access to a public invoice page at /share/invoice/<token>
-- without requiring login.
--
-- Tokens are generated lazily (on first share action) so existing invoices
-- have NULL until shared. Tokens can be revoked by setting the column to
-- NULL or rotated by overwriting with a new value.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS public_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_idx
  ON invoices (public_token)
  WHERE public_token IS NOT NULL;

COMMENT ON COLUMN invoices.public_token IS
  'Random opaque token granting read-only public access to this invoice.
   When non-null, the invoice can be viewed at /share/invoice/<token> and
   downloaded via /api/invoices/share/<token>/pdf without authentication.';
