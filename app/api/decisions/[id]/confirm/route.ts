import { NextResponse } from "next/server";
import { setDecisionStatus } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { actor?: string };
  const decision = await setDecisionStatus(id, "confirmed", (body.actor || "owner").slice(0, 120));
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  return NextResponse.json(decision);
}
