import { NextResponse } from "next/server";
import { resetLedger } from "@/lib/db";
import { GuardError, clientIp, enforceRateLimit, guardResponse } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(clientIp(request), "mutate");
  } catch (error) {
    if (error instanceof GuardError) return guardResponse(error);
    throw error;
  }
  const body = (await request.json().catch(() => ({}))) as { actor?: string };
  const voided = await resetLedger(String(body.actor ?? "owner").slice(0, 120));
  return NextResponse.json({ voided });
}
