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
  maxUploadBytes: 8 * 1024 * 1024,
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

export function demoLimits(): DemoLimits {
  return {
    maxUploadBytes: positiveInt(process.env.DEMO_MAX_UPLOAD_BYTES, DEFAULTS.maxUploadBytes),
    maxPasteChars: positiveInt(process.env.DEMO_MAX_PASTE_CHARS, DEFAULTS.maxPasteChars),
    analyzePerMinute: positiveInt(process.env.DEMO_RATE_LIMIT_PER_MINUTE, DEFAULTS.analyzePerMinute),
    mutationPerMinute: positiveInt(process.env.DEMO_MUTATION_RATE_LIMIT_PER_MINUTE, DEFAULTS.mutationPerMinute),
    dailyUsdMicros: positiveInt(process.env.DEMO_DAILY_USD_MICROS, DEFAULTS.dailyUsdMicros),
    dailyNemotronCalls: positiveInt(process.env.DEMO_DAILY_NEMOTRON_CALLS, DEFAULTS.dailyNemotronCalls),
    ipDailyNemotronCalls: positiveInt(process.env.DEMO_IP_DAILY_NEMOTRON_CALLS, DEFAULTS.ipDailyNemotronCalls),
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
}): { ok: true } | { ok: false; message: string } {
  if (input.ipCalls >= input.limits.ipDailyNemotronCalls) {
    return { ok: false, message: "This network has used today's Nemotron allowance. Try again tomorrow." };
  }
  if (input.calls >= input.limits.dailyNemotronCalls) {
    return { ok: false, message: "The public demo has reached today's Nemotron call cap. Try again tomorrow." };
  }
  if (input.spentMicros + input.holdMicros > input.limits.dailyUsdMicros) {
    return {
      ok: false,
      message: "The public demo has reached today's Nemotron spend cap, or this request is too large. Try a smaller invoice tomorrow.",
    };
  }
  return { ok: true };
}
