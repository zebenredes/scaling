import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";

export const MODEL = "claude-opus-5-5";

let _client: Anthropic | null = null;
const anthropic = () => (_client ??= new Anthropic());

// Si un clasificador de seguridad rechaza la petición, la API la reintenta
// en el modelo recomendado (server-side fallback, modo "default").
const FALLBACK: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

type Effort = "low" | "medium" | "high";

export class AIRefusalError extends Error {}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  if (message.stop_reason === "refusal") {
    throw new AIRefusalError("La IA rechazó esta petición. Reformula el contenido.");
  }
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Texto libre (copys, respuestas de chatbot, resúmenes). */
export async function generateText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: Effort;
  maxTokens?: number;
}): Promise<string> {
  const message = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: opts.messages,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "low" },
    ...FALLBACK,
  });
  return textOf(message);
}

/** Salida estructurada validada contra un esquema Zod. */
export async function generateJSON<T extends z.ZodTypeAny>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort?: Effort;
}): Promise<z.infer<T>> {
  const message = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
    ...FALLBACK,
  });
  return opts.schema.parse(JSON.parse(textOf(message)));
}
