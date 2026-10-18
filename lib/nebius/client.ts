import { appConfig } from "../env";

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

export async function nebiusChat(options: {
  model: string;
  messages: ChatMessage[];
  json?: boolean;
}): Promise<{ text: string; latencyMs: number; model: string }> {
  const config = appConfig();
  if (!config.nebiusApiKey) {
    throw new NebiusError("NEBIUS_API_KEY is not set", 0);
  }
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: options.model,
    temperature: 0,
    max_tokens: 4096,
    messages: options.messages,
  };
  if (options.json) body.response_format = { type: "json_object" };

  let response = await postChat(config.nebiusBaseUrl, config.nebiusApiKey, body);
  if (!response.ok && options.json && (response.status === 400 || response.status === 422)) {
    delete body.response_format;
    response = await postChat(config.nebiusBaseUrl, config.nebiusApiKey, body);
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
  return { text, latencyMs, model: options.model };
}

async function postChat(baseUrl: string, apiKey: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
      .join("\n");
  }
  return "";
}

export const EXTRACT_SYSTEM = `You extract supplier invoices into JSON. Copy amounts that are printed. Do not invent amounts, do not reconcile or round totals to force an equation, and do not decide whether to pay.
Money fields are integers in minor units as strings (THB: satang, USD: cents). 37,450.00 THB is "3745000".
quantity_millis is quantity times 1000, as a string. 100 units is "100000".
vat_rate_bps is the percent times 100. 7% is 700.
extraction_confidence_bps is an integer from 0 to 10000. If any money field is unreadable, set it below 8000 and use null for that field instead of guessing.
Dates are YYYY-MM-DD. currency is THB or USD.
Return only this JSON object:
{"supplier_legal_name":"","supplier_tax_id":"","supplier_country_code":"","invoice_number":"","issue_date":"","due_date":"","currency":"","vat_rate_bps":0,"subtotal_minor":"","vat_minor":"","total_minor":"","extraction_confidence_bps":0,"lines":[{"line_no":1,"description":"","quantity_millis":"","unit_price_minor":"","line_total_minor":""}]}`;

export const EXPLAIN_SYSTEM = `You explain a payment proposal that a deterministic engine already computed. You write Thai and English prose only.
Do not change the outcome. Do not calculate. Do not invent amounts, dates, counts, or RULE-* codes.
Every Arabic number in either summary must be one of: an integer in allowed_amounts, a 2-decimal currency amount whose minor units are in allowed_amounts, or a DSCR ratio whose micros value (ratio times 1000000) is in allowed_amounts. The threshold 1.25 is allowed because 1250000 is in the list.
Every RULE-* code must appear in evaluated_rules.
Return only JSON:
{"summary_th":"","summary_en":"","cited_rule_ids":[],"cited_amounts_minor":[],"missing_fields":[]}`;

export const TRANSCRIBE_SYSTEM = `Transcribe the invoice exactly as printed. Do not calculate missing totals, do not correct arithmetic, and do not add fields that are not visible. Keep every amount and the tax id.`;
