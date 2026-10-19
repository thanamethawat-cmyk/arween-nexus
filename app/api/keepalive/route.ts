import { NextResponse } from "next/server";
import { publicDbError, selectOne } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily Vercel Cron target. SELECT 1 wakes Neon Free after it scales to zero.
 * This route does not read invoices and does not call Nebius Token Factory.
 */
export async function GET() {
  try {
    await selectOne();
    return NextResponse.json({ ok: true, db: "select 1", nemotron: false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: publicDbError(error) }, { status: 503 });
  }
}
