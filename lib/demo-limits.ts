import { MAX_PAYLOAD_BYTES } from "./upload-limits";

export const QUOTA_CODES = ["RATE_LIMIT_PER_IP", "DAILY_IP_CAP", "DAILY_CALL_CAP", "DAILY_BUDGET"] as const;

export type QuotaCode = (typeof QUOTA_CODES)[number];

export type DemoLimits = {
  maxUploadBytes: number;
  maxPasteChars: number;
  analyzePerMinute: number;
  mutationPerMinute: number;
  dailyUsdMicros: number;
  dailyNemotronCalls: number;
  ipDailyNemotronCalls: number;
};

const DEFAULTS: DemoLimits = {
  maxUploadBytes: MAX_PAYLOAD_BYTES,
  maxPasteChars: 200_000,
  analyzePerMinute: 6,
  mutationPerMinute: 30,
  dailyUsdMicros: 300_000,
  dailyNemotronCalls: 80,
  ipDailyNemotronCalls: 30,
};

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

/** First valid positive integer wins. Blank or invalid entries are skipped. */
function firstPositiveInt(values: Array<string | undefined>, fallback: number): number {
  for (const raw of values) {
    if (!raw?.trim()) continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 1) return value;
  }
  return fallback;
}

/** Parse a dollar string such as `0.30` into millionths of a dollar. */
export function parseUsdMicros(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const micros = Number(whole) * 1_000_000 + Number(frac.padEnd(6, "0"));
  if (!Number.isSafeInteger(micros) || micros < 1) return null;
  return micros;
}

function dailyBudgetMicros(): number {
  const usd = process.env.DEMO_DAILY_BUDGET_USD;
  if (usd?.trim()) {
    const parsed = parseUsdMicros(usd);
    if (parsed !== null) return parsed;
  }
  return positiveInt(process.env.DEMO_DAILY_USD_MICROS, DEFAULTS.dailyUsdMicros);
}

export function demoLimits(): DemoLimits {
  return {
    maxUploadBytes: positiveInt(process.env.DEMO_MAX_UPLOAD_BYTES, DEFAULTS.maxUploadBytes),
    maxPasteChars: positiveInt(process.env.DEMO_MAX_PASTE_CHARS, DEFAULTS.maxPasteChars),
    analyzePerMinute: positiveInt(process.env.DEMO_RATE_LIMIT_PER_MINUTE, DEFAULTS.analyzePerMinute),
    mutationPerMinute: positiveInt(process.env.DEMO_MUTATION_RATE_LIMIT_PER_MINUTE, DEFAULTS.mutationPerMinute),
    dailyUsdMicros: dailyBudgetMicros(),
    dailyNemotronCalls: firstPositiveInt(
      [process.env.DEMO_DAILY_CALL_CAP, process.env.DEMO_DAILY_NEMOTRON_CALLS],
      DEFAULTS.dailyNemotronCalls,
    ),
    ipDailyNemotronCalls: positiveInt(process.env.DEMO_IP_DAILY_NEMOTRON_CALLS, DEFAULTS.ipDailyNemotronCalls),
  };
}

export function isQuotaCode(value: string): value is QuotaCode {
  return (QUOTA_CODES as readonly string[]).includes(value);
}

export function quotaMessage(code: QuotaCode): string {
  switch (code) {
    case "RATE_LIMIT_PER_IP":
      return "Too many reviews from this network in one minute. Wait about a minute and try again. Daily demo quotas reset at 00:00 UTC.";
    case "DAILY_IP_CAP":
      return "This network has used today's Nemotron allowance. The demo quota resets every day at 00:00 UTC.";
    case "DAILY_CALL_CAP":
      return "The public demo has reached today's Nemotron call cap. The demo quota resets every day at 00:00 UTC.";
    case "DAILY_BUDGET":
      return "The public demo has reached today's Nemotron spend cap, or this request is too large. The demo quota resets every day at 00:00 UTC.";
  }
}

export function retryHint(kind: "minute" | "utc-day", now = new Date()): { retryAfterSeconds: number; resetsAt: string } {
  const next = kind === "minute"
    ? new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    retryAfterSeconds: Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000)),
    resetsAt: next.toISOString(),
  };
}

export function uploadLimitLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function contentTooLarge(request: Request, limits: DemoLimits = demoLimits()): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  if (!Number.isFinite(length)) return false;
  return length > limits.maxUploadBytes + 1024 * 1024;
}

export function uploadTooBigMessage(limits: DemoLimits = demoLimits()): string {
  return `File is larger than ${uploadLimitLabel(limits.maxUploadBytes)}`;
}

/** Dollars per million tokens. Unknown models use Ultra rates so the cap stays conservative. */
export function modelRates(model: string): { input: number; output: number } {
  const id = model.toLowerCase();
  if (id.includes("ultra")) return { input: 1, output: 3 };
  if (id.includes("super") || id.includes("vl")) return { input: 0.3, output: 0.9 };
  if (id.includes("nano") || id.includes("lightning")) return { input: 0.06, output: 0.24 };
  return { input: 1, output: 3 };
}

/** Integer millionths of a dollar. 1_000_000 micros = $1. */
export function estimateCostMicros(model: string, promptTokens: number, completionTokens: number): number {
  const rates = modelRates(model);
  const prompt = Math.max(0, promptTokens);
  const completion = Math.max(0, completionTokens);
  return Math.ceil(prompt * rates.input + completion * rates.output);
}

export function budgetDecision(input: {
  spentMicros: number;
  calls: number;
  ipCalls: number;
  holdMicros: number;
  limits: DemoLimits;
}): { ok: true } | { ok: false; code: QuotaCode; message: string } {
  if (input.ipCalls >= input.limits.ipDailyNemotronCalls) {
    return { ok: false, code: "DAILY_IP_CAP", message: quotaMessage("DAILY_IP_CAP") };
  }
  if (input.calls >= input.limits.dailyNemotronCalls) {
    return { ok: false, code: "DAILY_CALL_CAP", message: quotaMessage("DAILY_CALL_CAP") };
  }
  if (input.spentMicros + input.holdMicros > input.limits.dailyUsdMicros) {
    return { ok: false, code: "DAILY_BUDGET", message: quotaMessage("DAILY_BUDGET") };
  }
  return { ok: true };
}
