import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';
  const company = session.metadata?.company || '';
  const role = session.metadata?.role || 'brand';
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!email) {
    console.error('No email found in checkout session:', session.id);
    return;
  }

  try {
    const supabase = await createAdminClient();
    const slug = company
      ? company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : email.split('@')[0];

    // Create tenant
    const plan = role === 'agency' ? 'agency' : 'brand';
    const maxBrands = role === 'agency' ? 25 : 1;

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: company || name || email,
        slug: `${slug}-${Date.now()}`,
        plan,
        max_brands: maxBrands,
        onboarding_complete: true,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return;
    }

    console.log('Created tenant:', tenant.id);

    // Create or link user profile
    // Check if auth user already exists (from /signup flow)
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: authUser?.id || null,
        email: email.toLowerCase(),
        name: name || company,
        role: 'owner',
        tenant_id: tenant.id,
      }, { onConflict: 'email' });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    // Update onboarding session status
    await supabase
      .from('onboarding_sessions')
      .update({
        status: 'completed',
        stripe_customer_id: customerId || null,
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase());

    console.log('Checkout completed for:', email, 'tenant:', tenant.id, 'subscription:', subscriptionId);
  } catch (err) {
    console.error('Error handling checkout completion:', err);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Webhook signature verification failed:', message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else {
    console.warn('No STRIPE_WEBHOOK_SECRET set, skipping signature verification');
    event = JSON.parse(body) as Stripe.Event;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('Subscription updated:', {
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price.id,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('Subscription canceled:', {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('Payment failed:', {
        invoiceId: invoice.id,
        customerId: invoice.customer,
      });
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
