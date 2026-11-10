/** Apex converts category line charts to 1-based numeric ticks. Its responsive
 * formatter receives those positions directly, unlike its desktop wrapper. */
export function sparseCategoryLabel(value: string, categories: string[], limit: number, format: (value: string) => string = value => value) {
  let index = categories.indexOf(value);
  const position = Number(value);
  if (index < 0 && value.trim() && Number.isFinite(position)) index = Math.floor(position) - 1;
  if (index < 0) index = categories.findIndex(category => format(category) === value);
  if (index < 0 || index >= categories.length) return '';
  const label = format(categories[index]);
  if (categories.length <= limit) return label;
  return Array.from({ length: limit }, (_, tick) => Math.round(tick * (categories.length - 1) / (limit - 1))).includes(index) ? label : '';
}
