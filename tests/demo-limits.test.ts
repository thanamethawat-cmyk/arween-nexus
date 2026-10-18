import { describe, expect, it } from "vitest";
import { budgetDecision, estimateCostMicros, modelRates, type DemoLimits } from "../lib/demo-limits";

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
    expect(budgetDecision({ spentMicros: 299_000, calls: 1, ipCalls: 1, holdMicros: 2_000, limits }).ok).toBe(false);
    expect(budgetDecision({ spentMicros: 0, calls: 80, ipCalls: 1, holdMicros: 1, limits }).ok).toBe(false);
    expect(budgetDecision({ spentMicros: 0, calls: 1, ipCalls: 30, holdMicros: 1, limits }).ok).toBe(false);
  });
});
