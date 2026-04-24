import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import * as billingService from "../services/billing.service";

const billingRoutes = new Hono();

billingRoutes.use("*", authMiddleware, teamScopeMiddleware);

// GET /api/v1/billing
billingRoutes.get("/", async (c) => {
  const teamId = c.get("teamId") as string;
  const plan = c.get("plan") as string;

  const usage = await import("../services/analytics.service").then((m) =>
    m.getUsage(teamId, plan)
  );

  return c.json(usage);
});

// POST /api/v1/billing/checkout
billingRoutes.post("/checkout", requireRole("OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const checkoutUrl = await billingService.createCheckoutSession(teamId);
  return c.json({ checkoutUrl });
});

// POST /api/v1/billing/portal
billingRoutes.post("/portal", requireRole("OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const portalUrl = await billingService.createPortalSession(teamId);
  return c.json({ portalUrl });
});

// DELETE /api/v1/billing/subscription
billingRoutes.delete("/subscription", requireRole("OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  await billingService.cancelSubscription(teamId);
  return c.json({ success: true, message: "Subscription will cancel at period end" });
});

export { billingRoutes };
