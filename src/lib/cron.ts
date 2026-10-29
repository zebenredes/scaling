import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/** Vercel Cron envía `Authorization: Bearer $CRON_SECRET`. */
export function unauthorizedCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
