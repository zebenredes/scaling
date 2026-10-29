"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { getCtx, field, numField } from "@/lib/context";
import { generateJSON } from "@/lib/ai";
import { publishSocialPost } from "@/lib/integrations";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

const PlanSchema = z.object({
  posts: z.array(
    z.object({
      day_offset: z.number().int(),
      hour: z.number().int(),
      content: z.string(),
      visual_idea: z.string(),
    }),
  ),
});

export async function generatePlan(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const clientId = field(form, "client_id");
  const platform = field(form, "platform")!;
  const days = Math.min(numField(form, "days") ?? 7, 31);
  const perWeek = Math.min(numField(form, "per_week") ?? 3, 14);
  const client = clientId ? (await supabase.from("clients").select("*").eq("id", clientId).single()).data : null;

  let msg: string;
  try {
    const { posts } = await generateJSON({
      system:
        "Eres social media manager. Diseñas calendarios de contenido que mezclan valor educativo, prueba social, detrás de cámaras y llamadas a la acción. Escribes en español, adaptado al formato y tono de cada red. Incluye hashtags solo donde la red los use.",
      prompt: `Crea un calendario de ${Math.max(1, Math.round((days / 7) * perWeek))} publicaciones para ${platform}, repartidas en los próximos ${days} días.

Marca: ${client?.name ?? "nuestra agencia de IA"} (${client?.industry ?? "automatización con IA"})
Temas / objetivo: ${field(form, "topic") ?? "posicionarse como referente y generar leads"}
Tono: ${field(form, "tone") ?? "cercano y profesional"}

- day_offset: 0..${days - 1}; hour: hora local 7..21 con buen engagement para la red.
- content: el texto final listo para publicar.
- visual_idea: descripción breve de la imagen, carrusel o vídeo.`,
      schema: PlanSchema,
    });
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    await supabase.from("social_posts").insert(
      posts.map((p) => {
        const at = new Date(base);
        at.setDate(at.getDate() + p.day_offset);
        at.setHours(p.hour, 0, 0, 0);
        return {
          workspace_id: workspaceId,
          client_id: clientId,
          platform,
          content: `${p.content}\n\n[Visual: ${p.visual_idea}]`,
          scheduled_at: at.toISOString(),
          status: "draft",
        };
      }),
    );
    msg = `ok=${posts.length} posts generados como borrador. Revísalos y prográmalos.`;
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/social?${msg}`);
}

export async function savePost(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const id = field(form, "id");
  const when = field(form, "scheduled_at");
  const row = {
    content: field(form, "content")!,
    media_url: field(form, "media_url"),
    scheduled_at: when ? new Date(when).toISOString() : null,
    status: field(form, "status") ?? "draft",
  };
  if (id) await supabase.from("social_posts").update(row).eq("id", id);
  else
    await supabase.from("social_posts").insert({
      ...row,
      workspace_id: workspaceId,
      client_id: field(form, "client_id"),
      platform: field(form, "platform")!,
    });
  revalidatePath("/social");
}

export async function scheduleAllDrafts() {
  const { supabase, workspaceId } = await getCtx();
  await supabase
    .from("social_posts")
    .update({ status: "scheduled" })
    .eq("workspace_id", workspaceId)
    .eq("status", "draft")
    .not("scheduled_at", "is", null);
  revalidatePath("/social");
}

export async function publishNow(form: FormData) {
  const { supabase } = await getCtx();
  const id = field(form, "id")!;
  const { data: p } = await supabase.from("social_posts").select("*").eq("id", id).single();
  let msg = "ok=Publicado";
  try {
    const { externalId } = await publishSocialPost(p!);
    await supabase
      .from("social_posts")
      .update({ status: "published", published_at: new Date().toISOString(), external_id: externalId, error: null })
      .eq("id", id);
  } catch (e) {
    await supabase.from("social_posts").update({ status: "failed", error: String(e) }).eq("id", id);
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/social?${msg}`);
}

export async function deletePost(form: FormData) {
  const { supabase } = await getCtx();
  await supabase.from("social_posts").delete().eq("id", field(form, "id")!);
  revalidatePath("/social");
}
