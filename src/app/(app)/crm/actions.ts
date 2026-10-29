"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { getCtx, field, numField } from "@/lib/context";
import { generateJSON } from "@/lib/ai";
import { upsertGhlContact } from "@/lib/integrations";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

export async function createContact(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data: contact } = await supabase
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      client_id: field(form, "client_id"),
      first_name: field(form, "first_name"),
      last_name: field(form, "last_name"),
      email: field(form, "email"),
      phone: field(form, "phone"),
      company: field(form, "company"),
      source: "manual",
      tags: (field(form, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    })
    .select("id")
    .single();

  const value = numField(form, "value");
  const stageId = field(form, "stage_id");
  if (contact && stageId) {
    const { data: stage } = await supabase.from("pipeline_stages").select("pipeline_id").eq("id", stageId).single();
    await supabase.from("opportunities").insert({
      workspace_id: workspaceId,
      pipeline_id: stage!.pipeline_id,
      stage_id: stageId,
      contact_id: contact.id,
      title: field(form, "company") ?? field(form, "first_name") ?? "Oportunidad",
      value: value ?? 0,
    });
  }
  revalidatePath("/crm");
}

export async function createOpportunity(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const stageId = field(form, "stage_id")!;
  const { data: stage } = await supabase.from("pipeline_stages").select("pipeline_id").eq("id", stageId).single();
  await supabase.from("opportunities").insert({
    workspace_id: workspaceId,
    pipeline_id: stage!.pipeline_id,
    stage_id: stageId,
    contact_id: field(form, "contact_id"),
    title: field(form, "title")!,
    value: numField(form, "value") ?? 0,
  });
  revalidatePath("/crm");
  revalidatePath(`/crm/contactos/${field(form, "contact_id")}`);
}

export async function moveOpportunity(form: FormData) {
  const { supabase } = await getCtx();
  const status = field(form, "status");
  await supabase
    .from("opportunities")
    .update({ stage_id: field(form, "stage_id")!, ...(status ? { status } : {}) })
    .eq("id", field(form, "id")!);
  revalidatePath("/crm");
}

export async function addActivity(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const contactId = field(form, "contact_id")!;
  await supabase.from("activities").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    type: field(form, "type") ?? "note",
    content: field(form, "content")!,
  });
  revalidatePath(`/crm/contactos/${contactId}`);
}

const ScoreSchema = z.object({
  score: z.number().int(),
  summary: z.string(),
  next_action: z.string(),
});

export async function scoreContact(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "contact_id")!;
  const [{ data: c }, { data: acts }, { data: opps }, { data: convs }, { data: calls }] = await Promise.all([
    supabase.from("contacts").select("*, leads(title, website, city, rating, reviews_count)").eq("id", id).single(),
    supabase.from("activities").select("type, content, created_at").eq("contact_id", id).order("created_at").limit(50),
    supabase.from("opportunities").select("title, value, status, pipeline_stages(name)").eq("contact_id", id),
    supabase.from("conversations").select("messages(role, content)").eq("contact_id", id).limit(3),
    supabase.from("calls").select("summary, outcome, created_at").eq("contact_id", id).limit(10),
  ]);

  let msg = "ok=Lead puntuado";
  try {
    const r = await generateJSON({
      system:
        "Eres un analista de ventas. Puntúas leads de 0 a 100 según encaje con el servicio, intención de compra y engagement mostrado. Sé conservador si hay poca información. Responde en español.",
      prompt: `Datos del contacto y su historial:\n${JSON.stringify({ contacto: c, actividades: acts, oportunidades: opps, conversaciones: convs, llamadas: calls }, null, 2)}\n\n- score: 0-100\n- summary: 2-3 frases sobre quién es y en qué punto está\n- next_action: la siguiente acción comercial concreta`,
      schema: ScoreSchema,
      effort: "low",
    });
    await supabase
      .from("contacts")
      .update({
        ai_score: Math.max(0, Math.min(100, r.score)),
        ai_summary: `${r.summary}\n\n➡️ ${r.next_action}`,
      })
      .eq("id", id);
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/crm/contactos/${id}?${msg}`);
}

export async function syncToGhl(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "contact_id")!;
  const { data: c } = await supabase.from("contacts").select("*").eq("id", id).single();
  let msg = "ok=Sincronizado con GoHighLevel";
  try {
    const ghlId = await upsertGhlContact({
      firstName: c!.first_name,
      lastName: c!.last_name,
      email: c!.email,
      phone: c!.phone,
      companyName: c!.company,
      tags: c!.tags,
    });
    await supabase.from("contacts").update({ ghl_id: ghlId }).eq("id", id);
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/crm/contactos/${id}?${msg}`);
}
