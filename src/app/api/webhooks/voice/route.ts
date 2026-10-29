import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/server";
import { generateJSON } from "@/lib/ai";

export const maxDuration = 60;

// Webhook de Vapi (Server URL). Configura el mismo secreto en Vapi → "Server URL Secret".
type VapiMessage = {
  type: string;
  status?: string;
  endedReason?: string;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  durationSeconds?: number;
  artifact?: { transcript?: string; recordingUrl?: string };
  analysis?: { summary?: string };
  call?: { id: string; metadata?: Record<string, string> };
};

const Outcome = z.object({
  outcome: z.enum(["reunion_agendada", "interesado", "no_interesado", "volver_a_llamar", "buzon_de_voz", "no_contesta"]),
  summary: z.string(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { message } = (await req.json()) as { message: VapiMessage };
  const providerCallId = message.call?.id;
  if (!providerCallId) return NextResponse.json({ ok: true });

  const db = createAdminClient();
  const { data: call } = await db.from("calls").select("*").eq("provider_call_id", providerCallId).maybeSingle();
  if (!call) return NextResponse.json({ ok: true });

  if (message.type === "status-update" && message.status) {
    await db.from("calls").update({ status: message.status }).eq("id", call.id);
  }

  if (message.type === "end-of-call-report") {
    const transcript = message.artifact?.transcript ?? message.transcript ?? "";
    let summary = message.analysis?.summary ?? message.summary ?? null;
    let outcome: string | null = message.endedReason ?? null;

    if (transcript.trim()) {
      try {
        const r = await generateJSON({
          system: "Clasificas el resultado de llamadas comerciales y las resumes en 1-2 frases en español.",
          prompt: `Transcripción:\n${transcript}`,
          schema: Outcome,
          effort: "low",
        });
        outcome = r.outcome;
        summary = r.summary;
      } catch (e) {
        console.error("call classification failed", e);
      }
    }

    await db
      .from("calls")
      .update({
        status: "ended",
        transcript,
        summary,
        outcome,
        recording_url: message.artifact?.recordingUrl ?? message.recordingUrl ?? null,
        duration_sec: message.durationSeconds ?? null,
      })
      .eq("id", call.id);

    if (call.contact_id) {
      await db.from("activities").insert({
        workspace_id: call.workspace_id,
        contact_id: call.contact_id,
        type: "call",
        content: `Llamada IA (${outcome ?? "sin resultado"}): ${summary ?? ""}`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
