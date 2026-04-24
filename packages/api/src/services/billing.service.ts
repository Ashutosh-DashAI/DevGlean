import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { env } from "../env";
import { logger } from "../lib/logger";
import { AppError, ErrorCode } from "@devglean/shared";

export async function createCheckoutSession(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw AppError.notFound("Team");
  }

  let customerId = team.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { teamId },
    });

    customerId = customer.id;

    await prisma.team.update({
      where: { id: teamId },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: env.STRIPE_PRO_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: `${env.WEB_BASE_URL}/settings?billing=success`,
    cancel_url: `${env.WEB_BASE_URL}/settings?billing=cancelled`,
    metadata: { teamId },
  });

  if (!session.url) {
    throw AppError.internal("Failed to create checkout session");
  }

  return session.url;
}

export async function createPortalSession(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { stripeCustomerId: true },
  });

  if (!team?.stripeCustomerId) {
    throw new AppError(
      ErrorCode.NO_ACTIVE_SUBSCRIPTION,
      "No billing account found. Please subscribe first.",
      400
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: `${env.WEB_BASE_URL}/settings`,
  });

  return session.url;
}

export async function cancelSubscription(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { stripeSubscriptionId: true },
  });

  if (!team?.stripeSubscriptionId) {
    throw new AppError(
      ErrorCode.NO_ACTIVE_SUBSCRIPTION,
      "No active subscription found",
      400
    );
  }

  await stripe.subscriptions.update(team.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  logger.info({ teamId }, "Subscription cancellation scheduled");
}

export async function handleWebhookEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as {
        id: string;
        status: string;
        customer: string;
      };

      if (subscription.status === "active") {
        await prisma.team.updateMany({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            plan: "PRO",
            stripeSubscriptionId: subscription.id,
          },
        });

        logger.info(
          { customerId: subscription.customer },
          "Subscription activated — upgraded to PRO"
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as {
        id: string;
        customer: string;
      };

      await prisma.team.updateMany({
        where: { stripeCustomerId: subscription.customer },
        data: {
          plan: "FREE",
          stripeSubscriptionId: null,
        },
      });

      logger.info(
        { customerId: subscription.customer },
        "Subscription cancelled — downgraded to FREE"
      );
      break;
    }

    default:
      logger.debug({ type: event.type }, "Unhandled Stripe webhook event");
  }
}
