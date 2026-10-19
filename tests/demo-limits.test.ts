import { afterEach, describe, expect, it } from "vitest";
import { budgetDecision, demoLimits, estimateCostMicros, modelRates, parseUsdMicros, quotaMessage, retryHint, type DemoLimits } from "../lib/demo-limits";

const limits: DemoLimits = {
  maxUploadBytes: 8 * 1024 * 1024,
  maxPasteChars: 200_000,
  analyzePerMinute: 6,
  mutationPerMinute: 30,
  dailyUsdMicros: 300_000,
  dailyNemotronCalls: 80,
  ipDailyNemotronCalls: 30,
};

describe("public demo Nemotron budget", () => {
  it("prices Nano, Ultra, and Super from the Token Factory list rates", () => {
    expect(modelRates("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B")).toEqual({ input: 0.06, output: 0.24 });
    expect(modelRates("nvidia/Nemotron-3-Ultra-550b-a55b")).toEqual({ input: 1, output: 3 });
    expect(modelRates("nvidia/nemotron-3-super-120b-a12b")).toEqual({ input: 0.3, output: 0.9 });
    expect(estimateCostMicros("nvidia/Nemotron-3-Ultra-550b-a55b", 1134, 998)).toBe(1134 * 1 + 998 * 3);
    expect(estimateCostMicros("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", 665, 704)).toBe(Math.ceil(665 * 0.06 + 704 * 0.24));
  });

  it("refuses a call that would cross the daily spend, call, or per-network cap", () => {
    expect(budgetDecision({ spentMicros: 10, calls: 1, ipCalls: 1, holdMicros: 5_000, limits }).ok).toBe(true);
    const budget = budgetDecision({ spentMicros: 299_000, calls: 1, ipCalls: 1, holdMicros: 2_000, limits });
    const calls = budgetDecision({ spentMicros: 0, calls: 80, ipCalls: 1, holdMicros: 1, limits });
    const ip = budgetDecision({ spentMicros: 0, calls: 1, ipCalls: 30, holdMicros: 1, limits });
    expect(budget).toMatchObject({ ok: false, code: "DAILY_BUDGET" });
    expect(calls).toMatchObject({ ok: false, code: "DAILY_CALL_CAP" });
    expect(ip).toMatchObject({ ok: false, code: "DAILY_IP_CAP" });
    if (!budget.ok) expect(budget.message).toBe(quotaMessage("DAILY_BUDGET"));
    if (!calls.ok) expect(calls.message).toContain("00:00 UTC");
    if (!ip.ok) expect(ip.message).toContain("00:00 UTC");
  });

  it("reads the dollar and call-cap env names and keeps the 80 / $0.30 defaults", () => {
    expect(parseUsdMicros("0.30")).toBe(300_000);
    expect(parseUsdMicros("1")).toBe(1_000_000);
    expect(parseUsdMicros("0")).toBeNull();
    const previous = {
      call: process.env.DEMO_DAILY_CALL_CAP,
      legacyCalls: process.env.DEMO_DAILY_NEMOTRON_CALLS,
      usd: process.env.DEMO_DAILY_BUDGET_USD,
      micros: process.env.DEMO_DAILY_USD_MICROS,
    };
    delete process.env.DEMO_DAILY_CALL_CAP;
    delete process.env.DEMO_DAILY_NEMOTRON_CALLS;
    delete process.env.DEMO_DAILY_BUDGET_USD;
    delete process.env.DEMO_DAILY_USD_MICROS;
    expect(demoLimits().dailyNemotronCalls).toBe(80);
    expect(demoLimits().dailyUsdMicros).toBe(300_000);
    process.env.DEMO_DAILY_NEMOTRON_CALLS = "40";
    process.env.DEMO_DAILY_CALL_CAP = "120";
    process.env.DEMO_DAILY_USD_MICROS = "1000";
    process.env.DEMO_DAILY_BUDGET_USD = "1.50";
    expect(demoLimits().dailyNemotronCalls).toBe(120);
    expect(demoLimits().dailyUsdMicros).toBe(1_500_000);
    restore("DEMO_DAILY_CALL_CAP", previous.call);
    restore("DEMO_DAILY_NEMOTRON_CALLS", previous.legacyCalls);
    restore("DEMO_DAILY_BUDGET_USD", previous.usd);
    restore("DEMO_DAILY_USD_MICROS", previous.micros);
  });

  it("names the next UTC midnight and the next minute as the retry hint", () => {
    const day = retryHint("utc-day", new Date("2026-10-19T23:00:00.000Z"));
    expect(day.resetsAt).toBe("2026-10-20T00:00:00.000Z");
    expect(day.retryAfterSeconds).toBe(3600);
    const minute = retryHint("minute", new Date("2026-10-19T23:00:10.000Z"));
    expect(minute.resetsAt).toBe("2026-10-19T23:01:00.000Z");
    expect(minute.retryAfterSeconds).toBe(50);
  });
});

const envKeys = ["DEMO_DAILY_CALL_CAP", "DEMO_DAILY_NEMOTRON_CALLS", "DEMO_DAILY_BUDGET_USD", "DEMO_DAILY_USD_MICROS"] as const;
const envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) restore(key, envSnapshot[key]);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
