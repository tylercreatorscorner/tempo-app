/**
 * Auto-detection of TikTok Shop XLSX export files.
 *
 * Given a filename, infer:
 *   - file type   (creator / video / affiliateproduct / unknown)
 *   - brand       (catakor / jiyu / lemme / ...)
 *   - report date (YYYY-MM-DD from the filename's date suffix)
 *
 * Tyler exports files with predictable naming like
 *   "JiYu_Creator_Data_20260427.xlsx" or
 *   "Lemme Video_Data 2026-04-27.xlsx".
 * The detection is forgiving (case-insensitive, multiple separators) and
 * always provides editable defaults the user can correct in the UI before
 * confirming an upload.
 */

export type FileType =
  | 'creator'
  | 'video'
  /**
   * The pre-merge Video List export -> the lifetime `videos` registry.
   * NOT part of the expected daily set any more (see detectFileType), but the
   * value must stay in the union: historical activity_log rows reference it,
   * upload_videos_atomic still exists, and the header sniff still selects it
   * for brands whose TikTok exports have not been merged yet.
   */
  | 'videolist'
  | 'affiliateproduct'
  | 'product'
  | 'unknown';

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  creator:          'Creator Data',
  video:            'Video Data',
  videolist:        'Video List',
  affiliateproduct: 'Affiliate Products (Transaction Analysis)',
  product:          'Product List (legacy)',
  unknown:          'Unknown',
};

export interface ExpectedDailyFile {
  /** The FileType the upload pipeline resolves this export to. */
  type: FileType;
  /** What the operator downloads it as in TikTok Shop. */
  exportLabel: string;
  /** The token TikTok puts in the filename, for the gap checklist. */
  exportToken: string;
}

/**
 * The exports the operator is expected to upload for every brand, every day.
 * THREE, not four: TikTok merged the Video List export into the Video Data
 * schema (~2026-07-13), so the *_Video_List_*.xlsx file now carries Video Data
 * content and the separate *_Video_Data_*.xlsx export is a duplicate (verified
 * 2026-07-22 on Bondie: same 25 columns, same 1,042 rows, same GMV / orders /
 * likes / views — the only differing column is `Video link`, an expiring signed
 * CDN URL that regenerates per export). The owner's call: keep uploading the
 * file NAMED Video List, drop Video Data.
 *
 * Note the label is not the report name: the video report still exports as
 * Video_List, and the product report as Transaction_Analysis. Anything that
 * tells the operator which files to go find must read from here.
 */
export const EXPECTED_DAILY_FILES: readonly ExpectedDailyFile[] = [
  { type: 'creator',          exportLabel: 'Creator Data',         exportToken: 'Creator_Data' },
  { type: 'video',            exportLabel: 'Video List',           exportToken: 'Video_List' },
  { type: 'affiliateproduct', exportLabel: 'Transaction Analysis', exportToken: 'Transaction_Analysis' },
] as const;

/** Map filename brand tokens -> canonical brand slug. */
const BRAND_MAP: Record<string, string> = {
  'cata-kor':            'catakor',
  'catakor':             'catakor',
  'cata_kor':            'catakor',
  'jiyu':                'jiyu',
  'physicians choice':   'physicians_choice',
  "physician's choice":  'physicians_choice',
  'physicians_choice':   'physicians_choice',
  'physicianschoice':    'physicians_choice',
  'pc':                  'physicians_choice',
  'leefar nutrition':    'leefar_nutrition',
  'leefar_nutrition':    'leefar_nutrition',
  'leefarnutrition':     'leefar_nutrition',
  'leefar supplements':  'leefar_supplements',
  'leefar_supplements':  'leefar_supplements',
  'leefarsupplements':   'leefar_supplements',
  'leefar us':           'leefar_us',
  'leefar_us':           'leefar_us',
  'leefarus':            'leefar_us',
  // LeeFar Nutrition US (store 4, added 2026-08). These three MUST exist:
  // extractBrand tries the longest token slice first, but 'leefar nutrition us'
  // is only reached as a 3-token candidate. A file named
  // "LeeFar_Nutrition_US.xlsx" falls through to the 2-token candidate
  // 'leefar nutrition' and would silently load a whole store's GMV under
  // LeeFar Nutrition Co.
  'leefar nutrition us':  'leefar_nutrition_us',
  'leefar_nutrition_us':  'leefar_nutrition_us',
  'leefarnutritionus':    'leefar_nutrition_us',
  'leefar':              'leefar_nutrition',
  'lemme':               'lemme',
  'toplux':              'toplux',
  'cosrx':               'cosrx',
};

/**
 * Detect file type from filename.
 *
 * `*_Video_List_*.xlsx` maps to 'video' (video_performance), NOT 'videolist'.
 * TikTok merged the Video List export into the Video Data schema ~2026-07-13
 * while keeping the old filename, so a file named Video List now contains
 * Video Data. Mapping it to 'videolist' sent it at the `videos` column map,
 * which matches 3 of 13 headers on the merged format — it parsed to zero rows
 * and dead-ended. Do NOT "restore" the old mapping.
 *
 * A handful of brands (jiyu, leefar_*, lemme as of 2026-07-25) still emit the
 * PRE-merge Video List layout. Those are rescued by the header sniff
 * (type-sniff.ts), which scores the real columns and switches back to
 * 'videolist' — the sniff is the backstop in both directions, not the primary
 * signal.
 */
export function detectFileType(filename: string): FileType {
  const lower = filename.toLowerCase();
  if (lower.includes('creator_data')          || lower.includes('creator data'))          return 'creator';
  if (lower.includes('video_data')            || lower.includes('video data'))            return 'video';
  if (lower.includes('video_list')            || lower.includes('video list'))            return 'video';
  if (lower.includes('transaction_analysis')  || lower.includes('affiliate_product'))     return 'affiliateproduct';
  if (lower.includes('product_list')          || lower.includes('product list'))          return 'product';
  return 'unknown';
}

/**
 * Detect brand from filename (longest-prefix match).
 *
 * Two passes:
 *   1. BRAND_MAP — hand-curated aliases (PC, Cata-Kor, …) that a name match
 *      can't infer.
 *   2. The LIVE brand list (brands_v2, passed by the upload page) — filename
 *      prefix matched against each brand's slug and display name. This is what
 *      keeps detection working for brands added AFTER this file was written:
 *      the hardcoded map alone silently returned 'unknown' for bondie /
 *      dr_dent / m3 / kitsch / … during the Jen "brands not reflecting"
 *      incident, adding friction to exactly the brands newest to the tool.
 */
export function extractBrand(
  filename: string,
  liveBrands?: { slug: string; name: string }[],
): string {
  // Drop extension and surrounding paths, lowercase, normalize whitespace
  const base = filename.replace(/\.(xlsx|xls|csv)$/i, '').replace(/[\\/]/g, ' ');
  const lower = base.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokens = lower.split('_');
  // Try longest match first (e.g. "leefar_supplements" before "leefar")
  for (let n = Math.min(tokens.length, 3); n >= 1; n--) {
    const candidates = [
      tokens.slice(0, n).join(' '),
      tokens.slice(0, n).join('_'),
      tokens.slice(0, n).join(''),
    ];
    for (const c of candidates) {
      if (BRAND_MAP[c]) return BRAND_MAP[c];
    }
  }

  // Live-list fallback: compare alphanumeric-only prefixes, longest key wins
  // ("leefarsupplements" must beat "leefar").
  if (liveBrands && liveBrands.length > 0) {
    const flat = lower.replace(/[^a-z0-9]/g, '');
    let best: { slug: string; len: number } | null = null;
    for (const b of liveBrands) {
      for (const key of [b.slug, b.name]) {
        const k = (key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (k.length >= 3 && flat.startsWith(k) && (!best || k.length > best.len)) {
          best = { slug: b.slug, len: k.length };
        }
      }
    }
    if (best) return best.slug;
  }

  return 'unknown';
}

/** Extract the report date from a filename, or default to today. */
export function extractDate(filename: string): string {
  // Range like "20260420-20260427" -> use end date
  const range = filename.match(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
  if (range) return `${range[4]}-${range[5]}-${range[6]}`;

  // Single YYYYMMDD followed by separator/extension
  const single = filename.match(/_(\d{4})(\d{2})(\d{2})\./);
  if (single) return `${single[1]}-${single[2]}-${single[3]}`;

  // YYYY-MM-DD or YYYY_MM_DD or YYYY.MM.DD
  const dashed = filename.match(/(\d{4})[._-](\d{1,2})[._-](\d{1,2})/);
  if (dashed) return `${dashed[1]}-${dashed[2].padStart(2, '0')}-${dashed[3].padStart(2, '0')}`;

  // Fallback: today
  return new Date().toISOString().split('T')[0];
}

/**
 * Validate that a report date is plausible. The TikTok export typically lags
 * one day — anything in the future is invalid; today is suspicious; older
 * dates are fine.
 */
export function validateReportDate(dateStr: string): { valid: boolean; warning?: string; error?: string } {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  if (dateStr > todayStr) {
    return { valid: false, error: `Future date (${dateStr}) — TikTok data can't be from the future.` };
  }
  if (dateStr === todayStr) {
    return { valid: true, warning: `Today's date (${dateStr}) — TikTok data typically lags ~1 day.` };
  }
  return { valid: true };
}
