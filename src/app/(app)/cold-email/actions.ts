"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { getCtx, field, numField } from "@/lib/context";
import { generateJSON } from "@/lib/ai";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

export async function createCampaign(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data } = await supabase
    .from("email_campaigns")
    .insert({
      workspace_id: workspaceId,
      client_id: field(form, "client_id"),
      name: field(form, "name")!,
      offer: field(form, "offer"),
      from_name: field(form, "from_name"),
      from_email: field(form, "from_email"),
      daily_limit: numField(form, "daily_limit") ?? 30,
    })
    .select("id")
    .single();
  redirect(`/cold-email/${data!.id}`);
}

export async function setCampaignStatus(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  await supabase.from("email_campaigns").update({ status: field(form, "status")! }).eq("id", id);
  revalidatePath(`/cold-email/${id}`);
}

export async function addStep(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const campaignId = field(form, "campaign_id")!;
  const { count } = await supabase
    .from("email_steps")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  await supabase.from("email_steps").insert({
    workspace_id: workspaceId,
    campaign_id: campaignId,
    step_order: (count ?? 0) + 1,
    delay_days: numField(form, "delay_days") ?? 0,
    subject: field(form, "subject")!,
    body: field(form, "body")!,
  });
  revalidatePath(`/cold-email/${campaignId}`);
}

export async function deleteStep(form: FormData) {
  const { supabase } = await getCtx();
  await supabase.from("email_steps").delete().eq("id", field(form, "id")!);
  revalidatePath(`/cold-email/${field(form, "campaign_id")}`);
}

const SequenceSchema = z.object({
  steps: z.array(
    z.object({
      delay_days: z.number().int(),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});

export async function generateSequence(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const campaignId = field(form, "campaign_id")!;
  const { data: c } = await supabase.from("email_campaigns").select("*").eq("id", campaignId).single();
  const icp = field(form, "icp_id")
    ? (await supabase.from("icps").select("*").eq("id", field(form, "icp_id")!).single()).data
    : null;

  let msg: string;
  try {
    const { steps } = await generateJSON({
      system:
        "Eres copywriter experto en cold email B2B. Escribes correos cortos (60-120 palabras), en tono humano, sin hype ni emojis, con una sola llamada a la acción de baja fricción. Responde en español.",
      prompt: `Escribe una secuencia de 3 emails en frío para esta campaña.

Oferta: ${c?.offer ?? "(sin especificar)"}
Remitente: ${c?.from_name ?? "el equipo"}
${icp ? `ICP: ${icp.industry ?? ""} en ${icp.location ?? ""}; cargos: ${icp.job_titles?.join(", ")}; dolores: ${icp.pains ?? ""}` : ""}

Reglas:
- Usa estas variables literalmente donde encajen: {{first_name}}, {{company}}, {{ai_icebreaker}} (una frase personalizada que se genera por lead; úsala al inicio del email 1).
- Email 1: delay_days 0. Email 2: delay_days 3 (follow-up con prueba social). Email 3: delay_days 4 (breakup).
- El cuerpo en texto plano, con saltos de línea. Firma con el nombre del remitente.`,
      schema: SequenceSchema,
    });
    await supabase.from("email_steps").delete().eq("campaign_id", campaignId);
    await supabase.from("email_steps").insert(
      steps.map((s, i) => ({ ...s, workspace_id: workspaceId, campaign_id: campaignId, step_order: i + 1 })),
    );
    msg = "ok=Secuencia generada con IA";
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/cold-email/${campaignId}?${msg}`);
}

export async function enrollList(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const campaignId = field(form, "campaign_id")!;
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("list_id", field(form, "list_id")!)
    .eq("status", "clean")
    .not("email", "is", null);
  const rows = (leads ?? []).map((l) => ({ workspace_id: workspaceId, campaign_id: campaignId, lead_id: l.id }));
  if (rows.length) {
    await supabase.from("email_enrollments").upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
  }
  redirect(`/cold-email/${campaignId}?ok=${rows.length} leads inscritos (solo leads limpios con email)`);
}

export async function markEnrollment(form: FormData) {
  const { supabase } = await getCtx();
  const status = field(form, "status")!;
  const { data: e } = await supabase
    .from("email_enrollments")
    .update({ status })
    .eq("id", field(form, "id")!)
    .select("lead_id, campaign_id")
    .single();
  if (e && status === "replied") await supabase.from("leads").update({ status: "replied" }).eq("id", e.lead_id);
  revalidatePath(`/cold-email/${e?.campaign_id}`);
}
