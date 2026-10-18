import { appConfig } from "../env";
import { reserveNemotronCall, settleNemotronCall } from "../guard";

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type ChatMessage = { role: "system" | "user"; content: ChatContent };

export class NebiusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export async function nebiusChat(options: {
  model: string;
  messages: ChatMessage[];
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; latencyMs: number; model: string; usage: TokenUsage }> {
  const config = appConfig();
  if (!config.nebiusApiKey) {
    throw new NebiusError("NEBIUS_API_KEY is not set", 0);
  }
  const spendId = await reserveNemotronCall(options.model, options.messages);
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: options.model,
    temperature: 0,
    max_tokens: options.maxTokens ?? 8192,
    messages: options.messages,
  };
  if (options.json) body.response_format = { type: "json_object" };
  const timeoutMs = options.timeoutMs ?? 180_000;

  let response = await postChat(config.nebiusBaseUrl, config.nebiusApiKey, body, timeoutMs);
  if (!response.ok && options.json && (response.status === 400 || response.status === 422)) {
    delete body.response_format;
    response = await postChat(config.nebiusBaseUrl, config.nebiusApiKey, body, timeoutMs);
  }
  const latencyMs = Date.now() - started;
  const raw = await response.text();
  if (!response.ok) {
    throw new NebiusError(`Token Factory ${response.status}: ${raw.slice(0, 500)}`, response.status);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NebiusError("Token Factory returned a non-JSON body", 502);
  }
  const text = readContent(parsed);
  if (!text) throw new NebiusError("Token Factory returned an empty completion", 502);
  const usage = readUsage(parsed);
  try {
    await settleNemotronCall(spendId, options.model, usage);
  } catch (error) {
    console.error("Nemotron spend settle failed", error);
  }
  return { text, latencyMs, model: options.model, usage };
}

async function postChat(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown; reasoning?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
      .join("\n")
      .trim();
    if (text) return text;
  }
  return typeof message?.reasoning === "string" ? message.reasoning : "";
}

function readUsage(payload: unknown): TokenUsage {
  const empty: TokenUsage = { promptTokens: null, completionTokens: null, totalTokens: null };
  if (!payload || typeof payload !== "object") return empty;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return empty;
  const row = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  return {
    promptTokens: asCount(row.prompt_tokens),
    completionTokens: asCount(row.completion_tokens),
    totalTokens: asCount(row.total_tokens),
  };
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const EXTRACT_SYSTEM = `You extract supplier invoices into JSON. Copy amounts that are printed. Do not invent amounts, do not reconcile or round totals to force an equation, and do not decide whether to pay.
Money fields are integers in minor units as strings (THB: satang, USD: cents). 37,450.00 THB is "3745000".
When the source already labels SUBTOTAL_MINOR, VAT_MINOR, TOTAL_MINOR, quantity_millis, or unit_price_minor, copy those integers exactly. Do not convert them again.
quantity_millis is quantity times 1000 only when the source prints a human quantity such as "100 units". If the source already names the column quantity_millis, or a LINE row is line_no | description | quantity_millis | unit_price_minor | line_total_minor, copy those integers unchanged. Do not multiply them again.
vat_rate_bps is the percent times 100. 7% is 700.
extraction_confidence_bps is an integer from 0 to 10000. If CONFIDENCE_BPS is printed, copy it exactly. If any money field is unreadable, set confidence below 8000 and use null for that field instead of guessing.
Dates are YYYY-MM-DD. currency is THB or USD.
Return only this JSON object:
{"supplier_legal_name":"","supplier_tax_id":"","supplier_country_code":"","invoice_number":"","issue_date":"","due_date":"","currency":"","vat_rate_bps":0,"subtotal_minor":"","vat_minor":"","total_minor":"","extraction_confidence_bps":0,"lines":[{"line_no":1,"description":"","quantity_millis":"","unit_price_minor":"","line_total_minor":""}]}`;

export const EXPLAIN_SYSTEM = `You explain a payment proposal that a deterministic engine already computed. You write Thai and English prose only.
Do not change the outcome. Do not calculate. Do not invent amounts, dates, invoice numbers, percentages, counts, or RULE-* codes.
Do not write any digit that is not already in template_th or template_en. Dates and invoice numbers contain digits, so omit them.
Every Arabic number in either summary must be one of: an integer in allowed_amounts, a 2-decimal currency amount whose minor units are in allowed_amounts, or a DSCR ratio whose micros value (ratio times 1000000) is in allowed_amounts. The threshold 1.25 is allowed because 1250000 is in the list.
Every RULE-* code must appear in evaluated_rules. cited_rule_ids must contain only the winning_rule_id. cited_amounts_minor must be an empty array.
Use template_th as summary_th and template_en as summary_en. You may delete words. You may not add words that contain a digit.
Return only JSON:
{"summary_th":"","summary_en":"","cited_rule_ids":[],"cited_amounts_minor":[]}`;

export const TRANSCRIBE_SYSTEM = `Transcribe the invoice exactly as printed. Do not calculate missing totals, do not correct arithmetic, and do not add fields that are not visible. Keep every amount and the tax id.`;
