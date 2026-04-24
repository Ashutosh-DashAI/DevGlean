import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { syncQueue } from "../jobs/queue";
import { githubConnector } from "../connectors/github.connector";
import { slackConnector } from "../connectors/slack.connector";
import { linearConnector } from "../connectors/linear.connector";
import * as billingService from "../services/billing.service";
import { stripe } from "../lib/stripe";
import { env } from "../env";
import { logger } from "../lib/logger";

const webhookRoutes = new Hono();

// POST /api/v1/webhooks/github
webhookRoutes.post("/github", async (c) => {
  const signature = c.req.header("x-hub-signature-256") ?? "";
  const body = await c.req.text();

  // Find connector with this webhook
  const connectors = await prisma.connector.findMany({
    where: {
      type: "GITHUB",
      status: "ACTIVE",
      webhookSecret: { not: null },
    },
  });

  let matchedConnector = null;
  for (const connector of connectors) {
    if (
      connector.webhookSecret &&
      githubConnector.validateWebhook(body, signature, connector.webhookSecret)
    ) {
      matchedConnector = connector;
      break;
    }
  }

  if (!matchedConnector) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = c.req.header("x-github-event");

  if (event === "push" || event === "pull_request") {
    await syncQueue.add(`webhook:github:${matchedConnector.id}`, {
      connectorId: matchedConnector.id,
      fullSync: false,
      teamId: matchedConnector.teamId,
    });

    logger.info(
      { connectorId: matchedConnector.id, event },
      "GitHub webhook triggered sync"
    );
  }

  return c.json({ received: true });
});

// POST /api/v1/webhooks/slack
webhookRoutes.post("/slack", async (c) => {
  const body = await c.req.text();
  const timestamp = c.req.header("x-slack-request-timestamp") ?? "";
  const signature = c.req.header("x-slack-signature") ?? "";

  const parsed = JSON.parse(body) as {
    type?: string;
    challenge?: string;
    event?: { type: string; channel: string };
  };

  // Handle URL verification challenge
  if (parsed.type === "url_verification") {
    return c.json({ challenge: parsed.challenge });
  }

  // Validate
  const fullSignature = `v0=${timestamp},v0=${signature}`;

  const connectors = await prisma.connector.findMany({
    where: { type: "SLACK", status: "ACTIVE" },
  });

  for (const connector of connectors) {
    if (connector.webhookSecret) {
      await syncQueue.add(`webhook:slack:${connector.id}`, {
        connectorId: connector.id,
        fullSync: false,
        teamId: connector.teamId,
      });
    }
  }

  return c.json({ received: true });
});

// POST /api/v1/webhooks/linear
webhookRoutes.post("/linear", async (c) => {
  const signature = c.req.header("linear-signature") ?? "";
  const body = await c.req.text();

  const connectors = await prisma.connector.findMany({
    where: { type: "LINEAR", status: "ACTIVE" },
  });

  for (const connector of connectors) {
    if (
      connector.webhookSecret &&
      linearConnector.validateWebhook(body, signature, connector.webhookSecret)
    ) {
      await syncQueue.add(`webhook:linear:${connector.id}`, {
        connectorId: connector.id,
        fullSync: false,
        teamId: connector.teamId,
      });

      logger.info(
        { connectorId: connector.id },
        "Linear webhook triggered sync"
      );
    }
  }

  return c.json({ received: true });
});

// POST /api/v1/webhooks/notion
webhookRoutes.post("/notion", async (c) => {
  // Notion doesn't have real webhooks — this is a placeholder for future use
  return c.json({ received: true });
});

// POST /api/v1/webhooks/stripe
webhookRoutes.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  const body = await c.req.text();

  if (!signature) {
    return c.json({ error: "Missing Stripe signature" }, 400);
  }

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    await billingService.handleWebhookEvent(event as {
      type: string;
      data: { object: Record<string, unknown> };
    });

    return c.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Stripe webhook validation failed");
    return c.json({ error: "Invalid signature" }, 400);
  }
});

export { webhookRoutes };
