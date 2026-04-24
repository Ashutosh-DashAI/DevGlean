import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

export const anthropic: Anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

if (env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}
