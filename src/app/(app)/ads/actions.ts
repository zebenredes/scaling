"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { getCtx, field, numField } from "@/lib/context";
import { generateJSON, generateText } from "@/lib/ai";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

const PLATFORM_RULES: Record<string, string> = {
  meta: "Meta Ads: headline ≤40 caracteres, primary_text 125 caracteres ideal (máx. 500), description ≤30.",
  google: "Google Ads (RSA): headline ≤30 caracteres, primary_text ≤90 caracteres (descripción), description ≤90.",
  tiktok: "TikTok Ads: primary_text ≤100 caracteres, tono nativo/UGC, headline ≤40 como gancho de los 3 primeros segundos.",
  linkedin: "LinkedIn Ads: headline ≤70 caracteres, primary_text ≤150 caracteres ideal, tono profesional.",
};

export async function createAdCampaign(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data } = await supabase
    .from("ad_campaigns")
    .insert({
      workspace_id: workspaceId,
      client_id: field(form, "client_id"),
      name: field(form, "name")!,
      platform: field(form, "platform")!,
      objective: field(form, "objective") ?? "leads",
      product: field(form, "product"),
      audience: field(form, "audience"),
      budget_daily: numField(form, "budget_daily"),
    })
    .select("id")
    .single();
  redirect(`/ads/${data!.id}`);
}

const CreativesSchema = z.object({
  creatives: z.array(
    z.object({
      angle: z.string(),
      headline: z.string(),
      primary_text: z.string(),
      description: z.string(),
      cta: z.string(),
      image_prompt: z.string(),
    }),
  ),
});

export async function generateCreatives(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const id = field(form, "campaign_id")!;
  const count = Math.min(numField(form, "count") ?? 5, 10);
  const { data: c } = await supabase.from("ad_campaigns").select("*, clients(name, industry)").eq("id", id).single();

  let msg: string;
  try {
    const { creatives } = await generateJSON({
      system:
        "Eres media buyer y copywriter de respuesta directa. Creas variaciones de anuncios para testear ángulos distintos (dolor, beneficio, prueba social, urgencia, objeción, curiosidad). Respeta los límites de caracteres de la plataforma. Responde en español.",
      prompt: `Genera ${count} creatividades, cada una con un ángulo distinto.

Plataforma: ${c?.platform}. ${PLATFORM_RULES[c?.platform ?? "meta"]}
Objetivo: ${c?.objective}
Cliente: ${(c?.clients as { name: string; industry: string } | null)?.name ?? "—"} (${(c?.clients as { industry: string } | null)?.industry ?? ""})
Producto/oferta: ${c?.product ?? ""}
Audiencia: ${c?.audience ?? ""}

- cta: uno de los CTA estándar de la plataforma (p. ej. "Más información", "Reservar", "Registrarte").
- image_prompt: prompt en inglés para generar la imagen/vídeo del anuncio con un modelo de imagen.`,
      schema: CreativesSchema,
    });
    await supabase
      .from("ad_creatives")
      .insert(creatives.map((cr) => ({ ...cr, workspace_id: workspaceId, campaign_id: id })));
    msg = `ok=${creatives.length} creatividades generadas`;
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/ads/${id}?${msg}`);
}

export async function updateCreative(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const patch: Record<string, unknown> = {};
  for (const k of ["impressions", "clicks", "conversions", "spend"]) {
    const v = numField(form, k);
    if (v !== null) patch[k] = v;
  }
  const status = field(form, "status");
  if (status) patch.status = status;
  await supabase.from("ad_creatives").update(patch).eq("id", id);
  revalidatePath(`/ads/${field(form, "campaign_id")}`);
}

export async function setAdCampaignStatus(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  await supabase.from("ad_campaigns").update({ status: field(form, "status")! }).eq("id", id);
  revalidatePath(`/ads/${id}`);
}

export async function analyzeCampaign(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "campaign_id")!;
  const [{ data: c }, { data: creatives }] = await Promise.all([
    supabase.from("ad_campaigns").select("*").eq("id", id).single(),
    supabase.from("ad_creatives").select("*").eq("campaign_id", id),
  ]);
  const rows = (creatives ?? []).map((cr) => ({
    id: cr.id.slice(0, 8),
    angulo: cr.angle,
    headline: cr.headline,
    estado: cr.status,
    impresiones: cr.impressions,
    clics: cr.clicks,
    conversiones: cr.conversions,
    gasto: cr.spend,
    ctr: cr.impressions ? +((cr.clicks / cr.impressions) * 100).toFixed(2) : null,
    cpa: cr.conversions ? +(cr.spend / cr.conversions).toFixed(2) : null,
  }));

  let msg = "ok=Análisis actualizado";
  try {
    const insights = await generateText({
      system:
        "Eres media buyer senior. Analizas el rendimiento de creatividades y das recomendaciones accionables y breves en español: qué pausar, qué escalar, qué nuevos ángulos testear y ajustes de presupuesto. Usa viñetas. No inventes métricas.",
      messages: [
        {
          role: "user",
          content: `Campaña ${c?.platform} · objetivo ${c?.objective} · presupuesto diario ${c?.budget_daily ?? "?"}\n\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
      effort: "medium",
    });
    await supabase.from("ad_campaigns").update({ ai_insights: insights }).eq("id", id);
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/ads/${id}?${msg}`);
}
