const COMPENSATION_FIELDS = new Set([
  'commission_rate', 'revenue_share_rate', 'retainer', 'launch_fee', 'launch_fee_name', 'launch_fee_ends',
  'product_retainer_amount', 'product_retainer_name', 'marketing_commission_rate', 'compensation_model',
]);

/** Send only intentional edits; legacy brand settings are not payee terms. */
export function buildArrangementPatch(values: object, baseline: object, billingOnly = false): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([field, value]) =>
    value !== (baseline as Record<string, unknown>)[field] && !(billingOnly && COMPENSATION_FIELDS.has(field))));
}
