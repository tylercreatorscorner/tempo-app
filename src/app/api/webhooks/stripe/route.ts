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

    // Determine plan from Stripe price
    const plan = role === 'agency' ? 'agency' : 'brand';
    const maxBrands = role === 'agency' ? 25 : 1;

    // Find existing profile (created during signup/email confirm)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, tenant_id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (profile?.tenant_id) {
      // UPDATE existing tenant (onboarding v2 flow: tenant already exists)
      const { error: updateError } = await supabase
        .from('tenants')
        .update({
          plan,
          max_brands: maxBrands,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null,
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.tenant_id);

      if (updateError) {
        console.error('Tenant update error:', updateError);
      } else {
        console.log('Updated tenant:', profile.tenant_id, 'plan:', plan, 'subscription:', subscriptionId);
      }
    } else {
      // FALLBACK: No profile yet (direct checkout without signup). Create tenant + profile.
      const slug = company
        ? company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : email.split('@')[0];

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: company || name || email,
          slug: `${slug}-${Date.now()}`,
          plan,
          max_brands: maxBrands,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null,
          onboarding_complete: true,
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant creation error:', tenantError);
        return;
      }

      // Find auth user if exists
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      await supabase
        .from('user_profiles')
        .upsert({
          user_id: authUser?.id || null,
          email: email.toLowerCase(),
          name: name || company,
          role: 'owner',
          tenant_id: tenant.id,
        }, { onConflict: 'email' });

      console.log('Created tenant:', tenant.id, 'for:', email);
    }

    // Update onboarding session if exists
    await supabase
      .from('onboarding_sessions')
      .update({
        status: 'completed',
        stripe_customer_id: customerId || null,
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase());

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
      const subCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      if (subCustomerId) {
        const supabase = await createAdminClient();
        // If subscription goes past_due or unpaid, keep plan but flag it
        if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
          await supabase
            .from('tenants')
            .update({ updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', subCustomerId);
          console.log('Subscription past_due/unpaid for customer:', subCustomerId);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const cancelCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      if (cancelCustomerId) {
        const supabase = await createAdminClient();
        // Downgrade tenant to free plan on cancellation
        const { error } = await supabase
          .from('tenants')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
            onboarding_complete: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', cancelCustomerId);
        if (error) {
          console.error('Error downgrading tenant on cancel:', error);
        } else {
          console.log('Tenant downgraded to free for customer:', cancelCustomerId);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const failedCustomerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      console.log('Payment failed for customer:', failedCustomerId, 'invoice:', invoice.id);
      // Could send an email or Telegram alert here
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
