/**
 * Brand Client Update — PDF download endpoint.
 *
 * Server-renders a polished weekly recap PDF designed to replace Tyler's
 * manual "deck + writeup" process. Returns the PDF binary directly so
 * the browser triggers a download.
 *
 * Forced to Node.js runtime — @react-pdf/renderer needs Node APIs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getBrandClientUpdateData } from '@/lib/data/discord-posts';
import { BrandClientUpdatePDF } from '@/lib/pdf/brand-client-pdf';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || 'all';
  const brandName = brand === 'all'
    ? 'All Brands'
    : (BRAND_DISPLAY_NAMES[brand] ?? brand);

  try {
    const data = await getBrandClientUpdateData(brand);
    // Call the component as a function to get the <Document> element directly —
    // renderToBuffer requires a ReactElement<DocumentProps>, not a wrapper.
    const docElement = BrandClientUpdatePDF({ data, brandName, generatedAt: new Date() });
    const pdf = await renderToBuffer(docElement);

    const safeBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const dateStamp = data.endDate.toISOString().slice(0, 10);
    const filename = `${safeBrand}-weekly-${dateStamp}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('Brand client PDF error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
