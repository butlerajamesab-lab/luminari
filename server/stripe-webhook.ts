import type { Express, Request, Response } from "express";
import Stripe from "stripe";

const STRIPE_API_VERSION = "2025-04-30.basil" as any;

function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "Stripe disabled: STRIPE_SECRET_KEY not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      res.status(400).json({ error: "Missing signature or webhook secret" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    // Handle test events
    if (event.id.startsWith("evt_test_")) {
      console.log("[Webhook] Test event detected, returning verification response");
      res.json({ verified: true });
      return;
    }

    // Handle events
    switch (event.type) {
      case "checkout.session.completed":
        console.log("[Stripe] Checkout completed:", event.data.object.id);
        break;
      case "customer.subscription.updated":
        console.log("[Stripe] Subscription updated:", event.data.object.id);
        break;
      case "customer.subscription.deleted":
        console.log("[Stripe] Subscription deleted:", event.data.object.id);
        break;
      default:
        console.log("[Stripe] Unhandled event type:", event.type);
    }

    res.json({ received: true });
  });
}
