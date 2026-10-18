import { NextResponse } from "next/server";
import { setDecisionStatus } from "@/lib/db";
import { GuardError, clientIp, enforceRateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await enforceRateLimit(clientIp(request), "mutate");
  } catch (error) {
    if (error instanceof GuardError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { actor?: string };
  const decision = await setDecisionStatus(id, "confirmed", (body.actor || "owner").slice(0, 120));
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  return NextResponse.json(decision);
}
