import { NextResponse } from "next/server";
import { updateAssumptions } from "@/lib/db";
import { GuardError, clientIp, enforceRateLimit, guardResponse } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    await enforceRateLimit(clientIp(request), "mutate");
  } catch (error) {
    if (error instanceof GuardError) return guardResponse(error);
    throw error;
  }
  const body = (await request.json()) as Record<string, unknown>;
  const cashInMinor = asMinor(body.cashInMinor);
  const cashOutOperatingMinor = asMinor(body.cashOutOperatingMinor);
  const principalDueMinor = asMinor(body.principalDueMinor);
  const interestDueMinor = asMinor(body.interestDueMinor);
  if (cashInMinor === null || cashOutOperatingMinor === null || principalDueMinor === null || interestDueMinor === null) {
    return NextResponse.json({ error: "Amounts must be non-negative minor-unit integers" }, { status: 400 });
  }
  await updateAssumptions({
    cashInMinor,
    cashOutOperatingMinor,
    principalDueMinor,
    interestDueMinor,
    actor: String(body.actor ?? "owner").slice(0, 120),
  });
  return NextResponse.json({ ok: true });
}

function asMinor(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}
