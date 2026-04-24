import OpenAI from "openai";
import { env } from "../env";

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

export const openai: OpenAI =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

if (env.NODE_ENV !== "production") {
  globalForOpenAI.openai = openai;
}
