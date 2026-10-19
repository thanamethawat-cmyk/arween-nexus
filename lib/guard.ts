import { NextResponse } from "next/server";
import { demoLimits, estimateCostMicros, budgetDecision, quotaMessage, retryHint, type QuotaCode } from "./demo-limits";
import { ensureDb, getPool } from "./db";
import { id } from "./ids";
import { currentIp } from "./request-context";
import type { ChatMessage } from "./nebius/client";

export class GuardError extends Error {
  readonly status = 429;

  constructor(
    readonly code: QuotaCode,
    message: string,
    readonly retryAfterSeconds: number,
    readonly resetsAt: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

export function quotaBody(error: GuardError) {
  return {
    error: error.message,
    code: error.code,
    retryAfterSeconds: error.retryAfterSeconds,
    resetsAt: error.resetsAt,
  };
}

export function guardResponse(error: GuardError) {
  return NextResponse.json(quotaBody(error), {
    status: error.status,
    headers: { "Retry-After": String(error.retryAfterSeconds) },
  });
}

function raiseQuota(code: QuotaCode, kind: "minute" | "utc-day"): never {
  const hint = retryHint(kind);
  throw new GuardError(code, quotaMessage(code), hint.retryAfterSeconds, hint.resetsAt);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw = (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9:.\-]/g, "").slice(0, 64);
  return cleaned || "unknown";
}

export async function enforceRateLimit(ip: string, route: "analyze" | "mutate"): Promise<void> {
  const limits = demoLimits();
  const limit = route === "analyze" ? limits.analyzePerMinute : limits.mutationPerMinute;
  await ensureDb();
  const pool = getPool();
  await pool.query("DELETE FROM demo_rate_buckets WHERE window_start < now() - interval '2 days'");
  const result = await pool.query<{ hits: number }>(
    `INSERT INTO demo_rate_buckets (ip, route, window_start, hits)
     VALUES ($1, $2, to_timestamp(floor(extract(epoch FROM now()) / 60) * 60), 1)
     ON CONFLICT (ip, route, window_start)
     DO UPDATE SET hits = demo_rate_buckets.hits + 1
     RETURNING hits`,
    [ip, route],
  );
  const hits = result.rows[0]?.hits ?? 1;
  if (hits > limit) raiseQuota("RATE_LIMIT_PER_IP", "minute");
}

export function estimatePromptTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const part of message.content) {
      chars += part.type === "text" ? part.text.length : part.image_url.url.length;
    }
  }
  return Math.ceil(chars / 4);
}

export async function reserveNemotronCall(model: string, messages: ChatMessage[]): Promise<string> {
  const limits = demoLimits();
  const ip = currentIp();
  const hold = Math.max(estimateCostMicros(model, estimatePromptTokens(messages), 512), 1);
  await ensureDb();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(842001)");
    await client.query("DELETE FROM demo_nebius_spend WHERE created_at < now() - interval '3 days'");
    const totals = await client.query<{ spent: string; calls: string; ip_calls: string }>(
      `SELECT
         COALESCE(SUM(cost_micros), 0)::text AS spent,
         COUNT(*)::text AS calls,
         COUNT(*) FILTER (WHERE ip = $1)::text AS ip_calls
       FROM demo_nebius_spend
       WHERE created_at >= (date_trunc('day', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC')`,
      [ip],
    );
    const row = totals.rows[0];
    const decision = budgetDecision({
      spentMicros: Number(row?.spent ?? 0),
      calls: Number(row?.calls ?? 0),
      ipCalls: Number(row?.ip_calls ?? 0),
      holdMicros: hold,
      limits,
    });
    if (!decision.ok) {
      const hint = retryHint("utc-day");
      throw new GuardError(decision.code, decision.message, hint.retryAfterSeconds, hint.resetsAt);
    }
    const spendId = id("nem_");
    await client.query(
      `INSERT INTO demo_nebius_spend (spend_id, ip, model_id, cost_micros) VALUES ($1, $2, $3, $4)`,
      [spendId, ip, model.slice(0, 200), hold],
    );
    await client.query("COMMIT");
    return spendId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function settleNemotronCall(
  spendId: string,
  model: string,
  usage: { promptTokens: number | null; completionTokens: number | null } | null,
): Promise<void> {
  if (!usage || usage.promptTokens === null || usage.completionTokens === null) return;
  const actual = estimateCostMicros(model, usage.promptTokens, usage.completionTokens);
  await getPool().query(
    `UPDATE demo_nebius_spend
     SET cost_micros = GREATEST(cost_micros, $2), prompt_tokens = $3, completion_tokens = $4
     WHERE spend_id = $1`,
    [spendId, actual, usage.promptTokens, usage.completionTokens],
  );
}
