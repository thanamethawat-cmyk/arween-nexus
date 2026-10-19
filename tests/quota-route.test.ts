import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { POST } from "../app/api/analyze/route";

const databaseUrl = process.env.DATABASE_URL || "postgres://arween:arween@127.0.0.1:5432/arween";

async function postgresIsUp(): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const dbUp = await postgresIsUp();

describe.skipIf(!dbUp)("analyze quota HTTP path", () => {
  it("returns HTTP 429 with a code and a retry hint before any model call", async () => {
    const previous = process.env.DEMO_RATE_LIMIT_PER_MINUTE;
    process.env.DEMO_RATE_LIMIT_PER_MINUTE = "1";
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    try {
      const first = await postAnalyze(ip);
      expect(first.status).toBe(400);
      const second = await postAnalyze(ip);
      expect(second.status).toBe(429);
      expect(second.headers.get("retry-after")).toBeTruthy();
      const body = (await second.json()) as {
        error?: string;
        code?: string;
        retryAfterSeconds?: number;
        resetsAt?: string;
      };
      expect(body.code).toBe("RATE_LIMIT_PER_IP");
      expect(body.error).toContain("00:00 UTC");
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    } finally {
      if (previous === undefined) delete process.env.DEMO_RATE_LIMIT_PER_MINUTE;
      else process.env.DEMO_RATE_LIMIT_PER_MINUTE = previous;
    }
  }, 30_000);
});

function postAnalyze(ip: string): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1/api/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({}),
    }),
  );
}
