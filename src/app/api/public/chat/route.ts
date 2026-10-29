import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/server";
import { replyAsAgent } from "@/lib/agent";

// Endpoint público del widget web. Se identifica por la public_key del agente.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Body = z.object({
  key: z.uuid(),
  session: z.string().min(8).max(100),
  message: z.string().min(1).max(2000),
});

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

/** Configuración pública del agente (nombre y bienvenida) para el widget. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!z.uuid().safeParse(key).success) return NextResponse.json({ error: "bad key" }, { status: 400, headers: CORS });
  const { data } = await createAdminClient()
    .from("text_agents")
    .select("name, welcome_message")
    .eq("public_key", key)
    .eq("active", true)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS });
  return NextResponse.json(data, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers: CORS });
  const { key, session, message } = parsed.data;

  const db = createAdminClient();
  const { data: agent } = await db
    .from("text_agents")
    .select("*")
    .eq("public_key", key)
    .eq("active", true)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS });

  try {
    const { reply } = await replyAsAgent(db, agent, `web:${session}`, message);
    return NextResponse.json({ reply }, { headers: CORS });
  } catch (e) {
    console.error("chat error", e);
    return NextResponse.json(
      { reply: "Perdona, ahora mismo no puedo responder. Inténtalo en un momento." },
      { status: 500, headers: CORS },
    );
  }
}
