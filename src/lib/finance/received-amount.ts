/** Recorded receipts take precedence, including an explicit zero. Legacy paid
 * invoices without receipt detail retain their invoice-total fallback. */
export function receivedAmount(invoice: {
  amount_received?: number | string | null;
  total_amount: number | string | null;
}): number {
  const value = Number(invoice.amount_received ?? invoice.total_amount);
  return Number.isFinite(value) ? value : 0;
}
