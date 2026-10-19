import { NextResponse } from "next/server";
import { demoLimits } from "@/lib/demo-limits";
import { pingDb, publicDbError } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    await pingDb();
    const limits = demoLimits();
    return NextResponse.json({
      ok: true,
      db: "select 1",
      nemotron: false,
      limits: {
        maxUploadBytes: limits.maxUploadBytes,
        analyzePerMinute: limits.analyzePerMinute,
        dailyNemotronCalls: limits.dailyNemotronCalls,
        dailyUsdMicros: limits.dailyUsdMicros,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: publicDbError(error) }, { status: 503 });
  }
}
