/**
 * GET /api/invoices/share/[token]/csv
 *
 * The creator breakdown, as a spreadsheet, for whoever holds the share link.
 *
 * The PDF stopped printing every creator (it was 11 of 12 pages on a one-line
 * invoice — see the rebuild in lib/invoices/pdf.tsx) and now points here
 * instead. A client who wants to reconcile needs the rows in something they
 * can sort and total, which is a CSV, not paper.
 *
 * Auth is the token itself, exactly like the share page and the share PDF next
 * to it. The token is 24 random bytes, and this returns nothing the invoice
 * page does not already show.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * RFC 4180 quoting. A creator handle is user-controlled text that lands in a
 * file people open in Excel, so this is not optional:
 *  · always quote, and double any embedded quote;
 *  · prefix a leading =, +, - or @ with an apostrophe. Excel executes those as
 *    formulas, which is CSV injection — a handle like `=cmd|...` would run on
 *    the client's machine, not ours.
 */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('invoice_number, brand, period_month, creator_breakdown, commission, marketing_gmv')
    .eq('public_token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = Array.isArray(invoice.creator_breakdown)
    ? (invoice.creator_breakdown as Array<{ name?: string; gmv?: number; rate?: number; commission?: number }>)
    : [];

  const lines: string[] = [
    ['Creator', 'Sales (GMV)', 'Rate %', 'Commission'].map(csvCell).join(','),
  ];
  let gmvTotal = 0;
  let commTotal = 0;
  for (const r of [...rows].sort((a, b) => Number(b?.gmv ?? 0) - Number(a?.gmv ?? 0))) {
    const gmv = Number(r?.gmv ?? 0);
    const comm = Number(r?.commission ?? 0);
    gmvTotal += gmv;
    commTotal += comm;
    // BARE handle, no leading '@'. The @ is decorative, and prepending it
    // meant every single row tripped the formula guard below and shipped with
    // a leading apostrophe — invisible in Excel, but visible in Google Sheets
    // and any text editor. Defending against a character we were adding
    // ourselves made the file worse for every reader. Bare handles are also
    // what you want in a spreadsheet: sortable, and joinable against exports.
    const handle = String(r?.name ?? '').replace(/^@+/, '');
    lines.push([
      csvCell(handle),
      // Bare numbers, not currency strings: this file exists to be summed.
      csvCell(gmv.toFixed(2)),
      csvCell(Number(r?.rate ?? 0).toFixed(2)),
      csvCell(comm.toFixed(2)),
    ].join(','));
  }
  // ── Reconcile to the invoice ─────────────────────────────────────────────
  //
  // The creator breakdown covers AFFILIATE sales only. Marketing GMV is
  // brand-level spend and is not attributable to any individual creator, so
  // its commission can never appear as a creator row — which meant the rows
  // summed to less than the commission being charged and looked like an error.
  // On TEMPO-2026-07-001: rows totalled $2,363.19 against a $2,452.69
  // commission, and the $89.50 difference is exactly marketing GMV.
  //
  // Stated as the DELTA from the invoice's own commission, never by
  // re-deriving a rate. That way it foots by construction and cannot drift
  // from what was actually billed.
  const invoiceCommission = Number(invoice.commission ?? 0);
  const marketingGmv = Number(invoice.marketing_gmv ?? 0);
  const nonCreator = Number((invoiceCommission - commTotal).toFixed(2));
  const showNonCreator = Math.abs(nonCreator) >= 0.01;

  if (showNonCreator) {
    lines.push([
      'Marketing GMV commission (not creator-attributable)',
      marketingGmv.toFixed(2),
      '',
      nonCreator.toFixed(2),
    ].map(csvCell).join(','));
  }

  // Totals foot against the invoice the client is holding, not against the
  // rows above it. Both columns move together with the reconciliation row so
  // the sheet is internally consistent either way.
  lines.push([
    'Total',
    (gmvTotal + (showNonCreator ? marketingGmv : 0)).toFixed(2),
    '',
    (showNonCreator ? invoiceCommission : commTotal).toFixed(2),
  ].map(csvCell).join(','));

  // Each payee's invoice carries the FULL brand GMV, not a slice, so someone
  // who downloads both months' files and sums the sales column gets twice the
  // GMV that exists. Commission DOES add up across them; the basis does not.
  // After a blank line, so a parser that stops at the first empty row still
  // gets clean tabular data.
  lines.push('');
  lines.push(csvCell(
    `Sales are the brand's total for ${invoice.period_month} and the basis this invoice's rate is applied to. ` +
    `They are not additive across the invoices issued for this period.`,
  ));

  const filename = `${invoice.invoice_number}_creators.csv`;
  // BOM so Excel opens UTF-8 handles correctly instead of mangling accents.
  const body = '﻿' + lines.join('\r\n') + '\r\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
