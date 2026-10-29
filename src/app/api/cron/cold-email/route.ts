import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai";
import { sendEmail } from "@/lib/integrations";
import { unauthorizedCron } from "@/lib/cron";

export const maxDuration = 300;

type Lead = {
  first_name: string | null;
  company: string | null;
  title: string | null;
  city: string | null;
  website: string | null;
  email: string;
  data: Record<string, unknown>;
};

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

async function icebreaker(lead: Lead, offer: string | null) {
  const facts = JSON.stringify({
    nombre: lead.first_name,
    empresa: lead.company,
    cargo: lead.title,
    ciudad: lead.city,
    web: lead.website,
    categoria: lead.data?.categoryName,
    reseñas: lead.data?.reviewsCount,
    valoracion: lead.data?.totalScore,
  });
  return generateText({
    system:
      "Escribes UNA sola frase de apertura (máx. 25 palabras) para un cold email en español, específica para el destinatario, basada solo en los datos dados. Sin saludos, sin halagos vacíos, sin inventar datos. Devuelve solo la frase.",
    messages: [{ role: "user", content: `Datos del lead: ${facts}\nOferta de la campaña: ${offer ?? ""}` }],
    effort: "low",
    maxTokens: 2000,
  });
}

/** Envía el siguiente paso de cada inscripción vencida, respetando daily_limit por campaña. */
export async function GET(req: NextRequest) {
  const denied = unauthorizedCron(req);
  if (denied) return denied;

  const db = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data: campaigns } = await db.from("email_campaigns").select("*").eq("status", "active");
  const report: Record<string, number> = {};

  for (const c of campaigns ?? []) {
    if (!c.from_email) continue;
    const { count: sentToday } = await db
      .from("email_messages")
      .select("id, email_enrollments!inner(campaign_id)", { count: "exact", head: true })
      .eq("email_enrollments.campaign_id", c.id)
      .gte("sent_at", startOfDay.toISOString());
    const budget = c.daily_limit - (sentToday ?? 0);
    if (budget <= 0) continue;

    const [{ data: steps }, { data: due }] = await Promise.all([
      db.from("email_steps").select("*").eq("campaign_id", c.id).order("step_order"),
      db
        .from("email_enrollments")
        .select("*, leads(first_name, company, title, city, website, email, data)")
        .eq("campaign_id", c.id)
        .eq("status", "active")
        .lte("next_send_at", new Date().toISOString())
        .order("next_send_at")
        .limit(budget),
    ]);
    if (!steps?.length) continue;

    let sent = 0;
    for (const e of due ?? []) {
      const lead = e.leads as Lead | null;
      const step = steps.find((s) => s.step_order === e.current_step);
      if (!lead?.email || !step) {
        await db.from("email_enrollments").update({ status: "completed" }).eq("id", e.id);
        continue;
      }

      const needsIcebreaker = /\{\{\s*ai_icebreaker\s*\}\}/.test(step.subject + step.body);
      const vars = {
        first_name: lead.first_name ?? "",
        company: lead.company ?? "tu empresa",
        ai_icebreaker: needsIcebreaker ? await icebreaker(lead, c.offer).catch(() => "") : "",
      };
      const subject = render(step.subject, vars);
      const body = render(step.body, vars);

      let status: "sent" | "failed" = "sent";
      let providerId: string | null = null;
      let error: string | null = null;
      try {
        providerId = (
          await sendEmail({
            from: c.from_name ? `${c.from_name} <${c.from_email}>` : c.from_email,
            to: lead.email,
            subject,
            text: body,
          })
        ).id;
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
      }

      await db.from("email_messages").insert({
        workspace_id: c.workspace_id,
        enrollment_id: e.id,
        step_id: step.id,
        to_email: lead.email,
        subject,
        body,
        status,
        provider_id: providerId,
        error,
      });

      if (status === "failed") {
        await db.from("email_enrollments").update({ status: "bounced" }).eq("id", e.id);
        continue;
      }
      sent++;
      const next = steps.find((s) => s.step_order === e.current_step + 1);
      await db
        .from("email_enrollments")
        .update(
          next
            ? {
                current_step: next.step_order,
                next_send_at: new Date(Date.now() + next.delay_days * 86_400_000).toISOString(),
              }
            : { status: "completed" },
        )
        .eq("id", e.id);
      if (e.current_step === 1) await db.from("leads").update({ status: "contacted" }).eq("id", e.lead_id);
    }
    report[c.id] = sent;
  }

  return NextResponse.json({ ok: true, sent: report });
}
