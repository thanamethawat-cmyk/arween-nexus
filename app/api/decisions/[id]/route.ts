import { NextResponse } from "next/server";
import { getDecision } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const decision = await getDecision(id);
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  return NextResponse.json(decision);
}
