"use server";

import { redirect } from "next/navigation";
import { getCtx, field } from "@/lib/context";
import { generateText } from "@/lib/ai";
import { startVapiCall } from "@/lib/integrations";
import { normalizePhone } from "@/lib/leads";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

function voiceFields(form: FormData) {
  return {
    name: field(form, "name")!,
    client_id: field(form, "client_id"),
    provider: field(form, "provider") ?? "vapi",
    provider_agent_id: field(form, "provider_agent_id"),
    voice: field(form, "voice"),
    first_message: field(form, "first_message"),
    goal: field(form, "goal"),
    script: field(form, "script") ?? "Eres un asistente telefónico amable y breve.",
  };
}

export async function createVoiceAgent(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data } = await supabase
    .from("voice_agents")
    .insert({ workspace_id: workspaceId, ...voiceFields(form) })
    .select("id")
    .single();
  redirect(`/agentes-voz/${data!.id}`);
}

export async function updateVoiceAgent(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const { error } = await supabase
    .from("voice_agents")
    .update({ ...voiceFields(form), active: form.get("active") !== null })
    .eq("id", id);
  redirect(`/agentes-voz/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "ok=Guardado"}`);
}

export async function draftVoiceScript(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const { data: a } = await supabase.from("voice_agents").select("*, clients(name, industry)").eq("id", id).single();
  let msg = "ok=Guion generado. Revísalo y guarda.";
  try {
    const script = await generateText({
      system:
        "Diseñas agentes de voz para llamadas telefónicas (Smart Calling). Escribes el prompt de sistema del agente en español: frases cortas y naturales para hablar, una pregunta cada vez, sin listas ni markdown en lo que dirá el agente. Devuelve solo el prompt.",
      messages: [
        {
          role: "user",
          content: `Negocio: ${JSON.stringify(a?.clients ?? {})}
Objetivo de la llamada: ${a?.goal ?? "calificar al lead y agendar una reunión"}
Contexto adicional: ${field(form, "brief") ?? ""}

Incluye: presentación y permiso para hablar, 3 preguntas de calificación, propuesta de valor en 2 frases, manejo de las 4 objeciones más comunes, cierre para agendar (propón dos horarios), qué hacer si sale el buzón de voz o piden no volver a llamar.`,
        },
      ],
      effort: "medium",
    });
    await supabase.from("voice_agents").update({ script }).eq("id", id);
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/agentes-voz/${id}?${msg}`);
}

export async function startCall(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const agentId = field(form, "agent_id")!;
  const contactId = field(form, "contact_id");
  const { data: agent } = await supabase.from("voice_agents").select("*").eq("id", agentId).single();
  const contact = contactId ? (await supabase.from("contacts").select("*").eq("id", contactId).single()).data : null;
  const number = normalizePhone(field(form, "to_number") ?? contact?.phone);

  let msg: string;
  if (!number?.startsWith("+")) {
    msg = "error=El número debe estar en formato internacional (+34…)";
  } else {
    const { data: call } = await supabase
      .from("calls")
      .insert({ workspace_id: workspaceId, agent_id: agentId, contact_id: contactId, to_number: number })
      .select("id")
      .single();
    try {
      const res = await startVapiCall({
        customerNumber: number,
        customerName: contact?.first_name,
        assistantId: agent!.provider_agent_id,
        assistant: { firstMessage: agent!.first_message, systemPrompt: agent!.script, voice: agent!.voice },
        metadata: { call_id: call!.id, workspace_id: workspaceId },
      });
      await supabase.from("calls").update({ provider_call_id: res.id, status: res.status }).eq("id", call!.id);
      msg = "ok=Llamada iniciada";
    } catch (e) {
      await supabase.from("calls").update({ status: "failed", summary: String(e) }).eq("id", call!.id);
      msg = `error=${errMsg(e)}`;
    }
  }
  redirect(`/agentes-voz/${agentId}?${msg}`);
}
