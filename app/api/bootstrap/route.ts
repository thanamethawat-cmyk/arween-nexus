import { NextResponse } from "next/server";
import { bootstrap } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await bootstrap());
  } catch (error) {
    const message = error instanceof Error ? error.message : "database unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
