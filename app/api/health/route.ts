import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await pingDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unhealthy";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
