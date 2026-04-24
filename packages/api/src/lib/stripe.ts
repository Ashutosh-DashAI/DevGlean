import Stripe from "stripe";
import { env } from "../env";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

export const stripe: Stripe =
  globalForStripe.stripe ??
  new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    typescript: true,
  });

if (env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe;
}
