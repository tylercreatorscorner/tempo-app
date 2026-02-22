import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { priceId, email, name, company, role, agencyBrandCount, successUrl, cancelUrl } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'priceId is required' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    // Find or create Stripe customer
    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
        // Update metadata on existing customer
        await stripe.customers.update(customerId, {
          name: name || undefined,
          metadata: {
            company: company || '',
            role: role || '',
            agency_brand_count: agencyBrandCount?.toString() || '',
          },
        });
      } else {
        const customer = await stripe.customers.create({
          email: email.toLowerCase().trim(),
          name: name || undefined,
          metadata: {
            company: company || '',
            role: role || '',
            agency_brand_count: agencyBrandCount?.toString() || '',
          },
        });
        customerId = customer.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      customer_email: customerId ? undefined : email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/onboarding?canceled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      metadata: {
        company: company || '',
        role: role || '',
        agency_brand_count: agencyBrandCount?.toString() || '',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Checkout error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
