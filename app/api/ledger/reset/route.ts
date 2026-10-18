import { NextResponse } from "next/server";
import { resetLedger } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { actor?: string };
  const voided = await resetLedger(String(body.actor ?? "owner").slice(0, 120));
  return NextResponse.json({ voided });
}
