import { NextResponse } from "next/server";
import { demoLimits } from "@/lib/demo-limits";
import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await pingDb();
    const limits = demoLimits();
    return NextResponse.json({
      ok: true,
      limits: {
        maxUploadBytes: limits.maxUploadBytes,
        analyzePerMinute: limits.analyzePerMinute,
        dailyNemotronCalls: limits.dailyNemotronCalls,
        dailyUsdMicros: limits.dailyUsdMicros,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unhealthy";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
