import type { Express } from "express";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2025-04-30.basil" as any });

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req, res) => {
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
