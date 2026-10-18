import { NextResponse } from "next/server";
import { contentTooLarge, uploadTooBigMessage } from "@/lib/demo-limits";
import { GuardError, clientIp, enforceRateLimit } from "@/lib/guard";
import { AnalyzeError, analyzeRequest } from "@/lib/pipeline";
import { requestContext } from "@/lib/request-context";
import type { SampleId } from "@/lib/samples";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    if (contentTooLarge(request)) {
      return NextResponse.json({ error: uploadTooBigMessage() }, { status: 413 });
    }
    const ip = clientIp(request);
    await enforceRateLimit(ip, "analyze");
    return await requestContext.run({ ip }, () => handleAnalyze(request));
  } catch (error) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AnalyzeError) {
      return NextResponse.json({ error: error.message, outcome: error.outcome }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "The review could not be completed" }, { status: 500 });
  }
}

async function handleAnalyze(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
      const result = await analyzeRequest({
        idempotencyKey,
        actor: String(form.get("actor") ?? "owner"),
        file: { filename: file.name, mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
      });
      return NextResponse.json(result);
    }
    const body = (await request.json()) as { sample?: string; text?: string; actor?: string };
    let sample: SampleId | undefined;
    if (body.sample !== undefined) {
      if (body.sample !== "A" && body.sample !== "B" && body.sample !== "C") {
        return NextResponse.json({ error: "Sample must be A, B, or C" }, { status: 400 });
      }
      sample = body.sample;
    }
    const result = await analyzeRequest({
      idempotencyKey,
      actor: body.actor ?? "owner",
      sample,
      text: typeof body.text === "string" ? body.text : undefined,
    });
    return NextResponse.json(result);
}
