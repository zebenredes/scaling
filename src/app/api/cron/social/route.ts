import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { publishSocialPost } from "@/lib/integrations";
import { unauthorizedCron } from "@/lib/cron";

/** Publica los posts programados cuya hora ya pasó. */
export async function GET(req: NextRequest) {
  const denied = unauthorizedCron(req);
  if (denied) return denied;

  const db = createAdminClient();
  const { data: due } = await db
    .from("social_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);

  let published = 0;
  for (const p of due ?? []) {
    try {
      const { externalId } = await publishSocialPost(p);
      await db
        .from("social_posts")
        .update({ status: "published", published_at: new Date().toISOString(), external_id: externalId, error: null })
        .eq("id", p.id);
      published++;
    } catch (err) {
      await db
        .from("social_posts")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("id", p.id);
    }
  }
  return NextResponse.json({ ok: true, published, due: due?.length ?? 0 });
}
