import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/ai";

export type TextAgent = {
  id: string;
  workspace_id: string;
  name: string;
  channel: string;
  system_prompt: string;
  knowledge: string | null;
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;

function buildSystem(agent: TextAgent) {
  return [
    agent.system_prompt,
    agent.knowledge ? `\n<base_de_conocimiento>\n${agent.knowledge}\n</base_de_conocimiento>` : "",
    `\nCanal: ${agent.channel}. Responde en el idioma del usuario, con mensajes breves aptos para chat (máx. 3-4 frases).`,
    "Usa solo la base de conocimiento para datos concretos (precios, horarios, servicios). Si no sabes algo, dilo y ofrece que una persona del equipo le contacte.",
    "Cuando el usuario muestre interés, pide amablemente su nombre y email o teléfono para darle seguimiento.",
  ].join("\n");
}

/** Busca o crea la conversación de un usuario externo (sesión web o número de WhatsApp). */
export async function getConversation(db: SupabaseClient, agent: TextAgent, externalUser: string) {
  const { data: existing } = await db
    .from("conversations")
    .select("id, contact_id")
    .eq("agent_id", agent.id)
    .eq("external_user", externalUser)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data } = await db
    .from("conversations")
    .insert({ workspace_id: agent.workspace_id, agent_id: agent.id, channel: agent.channel, external_user: externalUser })
    .select("id, contact_id")
    .single();
  return data!;
}

/** Si el usuario deja email/teléfono, crea el contacto en el CRM y lo vincula. */
async function captureContact(
  db: SupabaseClient,
  agent: TextAgent,
  conv: { id: string; contact_id: string | null },
  text: string,
  phoneHint?: string,
) {
  if (conv.contact_id) return;
  const email = text.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  const phone = text.match(PHONE_RE)?.[0]?.replace(/[^\d+]/g, "") ?? phoneHint ?? null;
  if (!email && !phone) return;
  const { data: contact } = await db
    .from("contacts")
    .insert({ workspace_id: agent.workspace_id, email, phone, source: `agente:${agent.name}`, tags: ["chatbot"] })
    .select("id")
    .single();
  if (!contact) return;
  await db.from("conversations").update({ contact_id: contact.id }).eq("id", conv.id);
  await db.from("activities").insert({
    workspace_id: agent.workspace_id,
    contact_id: contact.id,
    type: "chat",
    content: `Lead capturado por el agente "${agent.name}" (${agent.channel}).`,
  });
}

/** Guarda el mensaje del usuario, genera la respuesta del agente y la guarda. */
export async function replyAsAgent(
  db: SupabaseClient,
  agent: TextAgent,
  externalUser: string,
  userText: string,
  opts: { phoneHint?: string } = {},
) {
  const conv = await getConversation(db, agent, externalUser);
  await db.from("messages").insert({
    workspace_id: agent.workspace_id,
    conversation_id: conv.id,
    role: "user",
    content: userText,
  });

  const { data: history } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const messages: Anthropic.Beta.BetaMessageParam[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // La API exige empezar por un turno de usuario.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const reply = await generateText({ system: buildSystem(agent), messages, effort: "low", maxTokens: 4000 });

  await db.from("messages").insert({
    workspace_id: agent.workspace_id,
    conversation_id: conv.id,
    role: "assistant",
    content: reply,
  });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);
  await captureContact(db, agent, conv, userText, opts.phoneHint);
  return { reply, conversationId: conv.id };
}
