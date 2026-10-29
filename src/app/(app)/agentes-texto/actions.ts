"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCtx, field } from "@/lib/context";
import { generateText } from "@/lib/ai";
import { replyAsAgent } from "@/lib/agent";

const DEFAULT_PROMPT = `Eres el asistente virtual de {{negocio}}. Tu objetivo es resolver dudas de clientes potenciales y conseguir que agenden una cita o dejen sus datos de contacto.
Sé amable, cercano y concreto.`;

function agentFields(form: FormData) {
  return {
    name: field(form, "name")!,
    client_id: field(form, "client_id"),
    channel: field(form, "channel") ?? "web",
    system_prompt: field(form, "system_prompt") ?? DEFAULT_PROMPT,
    knowledge: field(form, "knowledge"),
    welcome_message: field(form, "welcome_message"),
    whatsapp_phone_id: field(form, "whatsapp_phone_id"),
    active: form.get("active") !== null,
  };
}

export async function createAgent(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data } = await supabase
    .from("text_agents")
    .insert({ workspace_id: workspaceId, ...agentFields(form), active: true })
    .select("id")
    .single();
  redirect(`/agentes-texto/${data!.id}`);
}

export async function updateAgent(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const { error } = await supabase.from("text_agents").update(agentFields(form)).eq("id", id);
  redirect(`/agentes-texto/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "ok=Guardado"}`);
}

/** Redacta el prompt de sistema a partir de una descripción del negocio. */
export async function draftPrompt(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const { data: agent } = await supabase.from("text_agents").select("*, clients(name, industry, website)").eq("id", id).single();
  let msg = "ok=Prompt redactado. Revísalo y guarda.";
  try {
    const prompt = await generateText({
      system:
        "Eres experto en diseñar agentes conversacionales de ventas y atención al cliente. Escribes prompts de sistema claros en segunda persona, en español. Devuelve solo el prompt.",
      messages: [
        {
          role: "user",
          content: `Escribe el prompt de sistema para un chatbot del canal ${agent?.channel}.
Negocio: ${JSON.stringify(agent?.clients ?? {})}
Objetivo y contexto del cliente: ${field(form, "brief") ?? ""}

Incluye: rol y personalidad, objetivo principal (cita/lead/venta), cómo calificar al lead (2-3 preguntas), manejo de objeciones típicas, cuándo derivar a un humano y límites (no inventar precios).`,
        },
      ],
      effort: "medium",
    });
    await supabase.from("text_agents").update({ system_prompt: prompt }).eq("id", id);
  } catch (e) {
    msg = `error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(`/agentes-texto/${id}?${msg}`);
}

/** Playground: conversa con el agente desde el panel. */
export async function testAgent(agentId: string, message: string) {
  const { supabase, user } = await getCtx();
  const { data: agent } = await supabase.from("text_agents").select("*").eq("id", agentId).single();
  if (!agent) throw new Error("Agente no encontrado");
  const { reply } = await replyAsAgent(supabase, agent, `playground:${user.id}`, message);
  return reply;
}

export async function resetPlayground(agentId: string) {
  const { supabase, user } = await getCtx();
  await supabase.from("conversations").delete().eq("agent_id", agentId).eq("external_user", `playground:${user.id}`);
  revalidatePath(`/agentes-texto/${agentId}`);
}
