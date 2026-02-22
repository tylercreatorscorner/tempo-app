import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const runtime = 'nodejs';

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
    // In test mode without webhook secret, parse the body directly
    console.warn('⚠️ No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
    event = JSON.parse(body) as Stripe.Event;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('✅ Checkout completed:', {
        sessionId: session.id,
        customerId: session.customer,
        subscriptionId: session.subscription,
        email: session.customer_details?.email,
      });
      // TODO: Wire to Supabase — create user record, associate subscription
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('🔄 Subscription updated:', {
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price.id,
      });
      // TODO: Wire to Supabase — update subscription status/plan
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('❌ Subscription canceled:', {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      });
      // TODO: Wire to Supabase — mark subscription as canceled
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('⚠️ Payment failed:', {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        subscriptionId: (invoice as unknown as { subscription: string | null }).subscription,
      });
      // TODO: Wire to Supabase — flag payment issue, send notification
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
