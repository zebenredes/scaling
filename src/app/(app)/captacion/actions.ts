"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { getCtx, field, numField } from "@/lib/context";
import { generateJSON } from "@/lib/ai";
import { APIFY_ACTORS, getApifyRun, pushToClay, startApifyRun } from "@/lib/integrations";
import { cleanLead, dedupeKey, mapExternalItem, parseCsv, type LeadInput } from "@/lib/leads";

const errMsg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : String(e));

// ------------------------------------------------------------------ ICP
export async function createIcp(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  await supabase.from("icps").insert({
    workspace_id: workspaceId,
    name: field(form, "name")!,
    industry: field(form, "industry"),
    location: field(form, "location"),
    company_size: field(form, "company_size"),
    job_titles: (field(form, "job_titles") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    pains: field(form, "pains"),
    offer: field(form, "offer"),
  });
  revalidatePath("/captacion");
}

const IcpSchema = z.object({
  name: z.string(),
  industry: z.string(),
  location: z.string(),
  company_size: z.string(),
  job_titles: z.array(z.string()),
  pains: z.string(),
  offer: z.string(),
});

export async function generateIcp(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const description = field(form, "description");
  if (!description) return;
  let error: string | null = null;
  try {
    const icp = await generateJSON({
      system:
        "Eres un estratega de ventas B2B para agencias de IA. Defines Perfiles de Cliente Ideal (ICP) concretos y accionables para prospección en frío. Responde en español.",
      prompt: `Define un ICP a partir de esta descripción del negocio y servicio que vende la agencia:\n\n${description}\n\n- industry: nicho concreto (no genérico)\n- location: ciudad/país objetivo\n- company_size: rango de empleados o facturación\n- job_titles: cargos de los decisores a contactar\n- pains: 3-5 dolores principales, en una frase cada uno\n- offer: la oferta irresistible en una frase`,
      schema: IcpSchema,
    });
    await supabase.from("icps").insert({ workspace_id: workspaceId, ...icp });
  } catch (e) {
    error = errMsg(e);
  }
  redirect(error ? `/captacion?error=${error}` : "/captacion?ok=ICP generado con IA");
}

// ------------------------------------------------------------------ Listas
export async function createList(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const { data } = await supabase
    .from("lead_lists")
    .insert({ workspace_id: workspaceId, name: field(form, "name")!, icp_id: field(form, "icp_id") })
    .select("id")
    .single();
  redirect(`/captacion/${data!.id}`);
}

async function insertLeads(listId: string, source: string, rows: LeadInput[]) {
  const { supabase, workspaceId } = await getCtx();
  const payload = rows.map((r) => ({
    workspace_id: workspaceId,
    list_id: listId,
    source,
    rating: r.rating ?? null,
    reviews_count: r.reviews_count ?? null,
    data: r.data ?? {},
    ...cleanLead(r),
  }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from("leads").insert(payload.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return payload.length;
}

export async function importCsv(form: FormData) {
  const listId = field(form, "list_id")!;
  const file = form.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : (field(form, "csv") ?? "");
  let msg: string;
  try {
    msg = `ok=${await insertLeads(listId, "csv", parseCsv(text).map(mapExternalItem))} leads importados`;
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/captacion/${listId}?${msg}`);
}

export async function addLead(form: FormData) {
  const listId = field(form, "list_id")!;
  await insertLeads(listId, "manual", [
    {
      company: field(form, "company"),
      first_name: field(form, "first_name"),
      last_name: field(form, "last_name"),
      title: field(form, "title"),
      email: field(form, "email"),
      phone: field(form, "phone"),
      website: field(form, "website"),
      city: field(form, "city"),
    },
  ]);
  revalidatePath(`/captacion/${listId}`);
}

// ------------------------------------------------------------------ Scraping
export async function startScrape(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const listId = field(form, "list_id")!;
  const kind = field(form, "kind") as "google_maps" | "decision_makers" | "complex" | "clay";
  const query = field(form, "query") ?? "";
  const location = field(form, "location") ?? "";
  const limit = numField(form, "limit") ?? 50;

  let msg: string;
  try {
    if (kind === "clay") {
      // Enrichment: enviamos los leads actuales de la lista a la tabla de Clay.
      const { data: leads } = await supabase.from("leads").select("*").eq("list_id", listId).limit(limit);
      await pushToClay(leads ?? []);
      await supabase.from("scrape_jobs").insert({
        workspace_id: workspaceId,
        list_id: listId,
        kind,
        params: { limit },
        status: "succeeded",
        result_count: leads?.length ?? 0,
        finished_at: new Date().toISOString(),
      });
      msg = `ok=${leads?.length ?? 0} leads enviados a Clay`;
    } else {
      const input =
        kind === "google_maps"
          ? { searchStringsArray: [query], locationQuery: location, maxCrawledPlacesPerSearch: limit, language: "es" }
          : kind === "decision_makers"
            ? { job_title: query.split(",").map((s) => s.trim()), location: [location], fetch_count: limit }
            : { queries: `${query} ${location}`.trim(), maxPagesPerQuery: Math.ceil(limit / 10) };

      const run = await startApifyRun(APIFY_ACTORS[kind], input);
      await supabase.from("scrape_jobs").insert({
        workspace_id: workspaceId,
        list_id: listId,
        kind,
        params: { query, location, limit },
        status: "running",
        provider_run_id: run.id,
      });
      await supabase.from("lead_lists").update({ source: kind }).eq("id", listId);
      msg = `ok=Scraping iniciado. Pulsa "Actualizar" en unos minutos.`;
    }
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/captacion/${listId}?${msg}`);
}

export async function syncScrapeJob(form: FormData) {
  const { supabase } = await getCtx();
  const jobId = field(form, "job_id")!;
  const { data: job } = await supabase.from("scrape_jobs").select("*").eq("id", jobId).single();
  if (!job?.provider_run_id) return;
  let msg = "";
  try {
    const { status, items } = await getApifyRun(job.provider_run_id);
    if (status === "SUCCEEDED") {
      const n = await insertLeads(job.list_id, job.kind, items.map(mapExternalItem));
      await supabase
        .from("scrape_jobs")
        .update({ status: "succeeded", result_count: n, finished_at: new Date().toISOString() })
        .eq("id", jobId);
      msg = `ok=${n} leads importados`;
    } else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      await supabase.from("scrape_jobs").update({ status: "failed", error: status }).eq("id", jobId);
      msg = `error=El scraping terminó con estado ${status}`;
    } else {
      msg = `ok=Sigue en curso (${status})`;
    }
  } catch (e) {
    msg = `error=${errMsg(e)}`;
  }
  redirect(`/captacion/${job.list_id}?${msg}`);
}

// ------------------------------------------------------------------ Limpieza
export async function cleanList(form: FormData) {
  const { supabase } = await getCtx();
  const listId = field(form, "list_id")!;
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("list_id", listId)
    .order("created_at");

  const seen = new Set<string>();
  const duplicates: string[] = [];
  let invalid = 0;
  for (const lead of leads ?? []) {
    const key = dedupeKey(lead);
    if (seen.has(key)) {
      duplicates.push(lead.id);
      continue;
    }
    seen.add(key);
    const cleaned = cleanLead(lead);
    const usable = cleaned.email_valid === true || (!cleaned.email && !!cleaned.phone);
    if (!usable) invalid++;
    await supabase
      .from("leads")
      .update({
        ...cleaned,
        status: ["new", "clean", "invalid"].includes(lead.status) ? (usable ? "clean" : "invalid") : lead.status,
      })
      .eq("id", lead.id);
  }
  if (duplicates.length) await supabase.from("leads").delete().in("id", duplicates);
  redirect(
    `/captacion/${listId}?ok=Limpieza completa: ${duplicates.length} duplicados eliminados, ${invalid} marcados como inválidos`,
  );
}

// ------------------------------------------------------------------ Envío al CRM
export async function pushListToCrm(form: FormData) {
  const { supabase, workspaceId } = await getCtx();
  const listId = field(form, "list_id")!;
  const { data: leads } = await supabase.from("leads").select("*").eq("list_id", listId).eq("status", "clean");
  const { data: existing } = await supabase.from("contacts").select("lead_id").eq("workspace_id", workspaceId);
  const already = new Set((existing ?? []).map((c) => c.lead_id));
  const rows = (leads ?? [])
    .filter((l) => !already.has(l.id))
    .map((l) => ({
      workspace_id: workspaceId,
      lead_id: l.id,
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      phone: l.phone,
      company: l.company,
      source: l.source,
      tags: ["captacion"],
    }));
  if (rows.length) await supabase.from("contacts").insert(rows);
  redirect(`/captacion/${listId}?ok=${rows.length} contactos creados en el CRM`);
}
