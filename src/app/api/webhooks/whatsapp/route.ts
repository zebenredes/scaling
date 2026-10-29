import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { replyAsAgent } from "@/lib/agent";
import { sendWhatsApp } from "@/lib/integrations";

export const maxDuration = 60;

/** Verificación del webhook de Meta (WhatsApp Cloud API). */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge"));
  }
  return new NextResponse("forbidden", { status: 403 });
}

type WaPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: { from: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
};

/** Meta firma cada POST con HMAC-SHA256 del App Secret. */
function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let body: WaPayload;
  try {
    body = JSON.parse(raw) as WaPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const db = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneId = change.value?.metadata?.phone_number_id;
      if (!phoneId) continue;
      const { data: agent } = await db
        .from("text_agents")
        .select("*")
        .eq("whatsapp_phone_id", phoneId)
        .eq("active", true)
        .maybeSingle();
      if (!agent) continue;

      for (const m of change.value?.messages ?? []) {
        if (m.type !== "text" || !m.text?.body) continue;
        try {
          const { reply } = await replyAsAgent(db, agent, `wa:${m.from}`, m.text.body, { phoneHint: `+${m.from}` });
          await sendWhatsApp(phoneId, m.from, reply);
        } catch (e) {
          console.error("whatsapp error", e);
        }
      }
    }
  }
  // Meta reintenta si no recibe 200 rápido.
  return NextResponse.json({ ok: true });
}
