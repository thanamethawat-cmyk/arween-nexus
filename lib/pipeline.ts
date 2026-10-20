import { decide } from "./engine/decide";
import { validateExplanation, type ExplanationDraft } from "./engine/hallucination";
import { templateExplanation } from "./engine/templates";
import { RULE_IDS, type InvoiceInput } from "./engine/types";
import { extractJsonObject } from "./extract/json";
import { hasInvoiceSignal, SCHEMA_REJECTED, UNREADABLE_INVOICE } from "./extract/readable";
import { MIN_PDF_TEXT_CHARS } from "./upload-limits";
import { parseStrictInvoice } from "./extract/strict";
import { EXTRACT_SYSTEM, EXPLAIN_SYSTEM, TRANSCRIBE_SYSTEM, NebiusError, nebiusChat } from "./nebius/client";
import { appConfig } from "./env";
import {
  findCounterpartyId,
  findDecisionIdByIdempotency,
  getDecision,
  hasActiveDuplicate,
  loadContext,
  persistAnalysis,
  recordAudit,
  recordInvocations,
  voidReplayInvoices,
  type InvocationDraft,
} from "./db";
import { invoiceToText, sampleInvoices, type SampleId } from "./samples";
import { TavilyError, retrieveCounterparty } from "./tavily/client";
import type { DecisionView } from "./view";
import { demoLimits, uploadTooBigMessage } from "./demo-limits";
import { GuardError } from "./guard";

export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly outcome: "INSUFFICIENT" | null = null,
  ) {
    super(message);
  }
}

export async function analyzeRequest(options: {
  idempotencyKey: string;
  actor: string;
  sample?: SampleId;
  text?: string;
  file?: { filename: string; mime: string; bytes: Buffer };
}): Promise<{ decision: DecisionView; replayed: boolean }> {
  if (!options.idempotencyKey.trim() || options.idempotencyKey.length > 200) {
    throw new AnalyzeError("Idempotency-Key is required", 400);
  }
  const existingId = await findDecisionIdByIdempotency(options.idempotencyKey);
  if (existingId) {
    const existing = await getDecision(existingId);
    if (existing) return { decision: existing, replayed: true };
  }
  const actor = options.actor.trim().slice(0, 120) || "owner";
  let filename = "pasted.txt";
  let text = options.text ?? "";
  let image: { mime: string; bytes: Buffer } | undefined;

  if (options.sample) {
    text = invoiceToText(sampleInvoices[options.sample]);
    filename = `sample-${options.sample}.txt`;
  } else if ((options.text ?? "").length > demoLimits().maxPasteChars) {
    throw new AnalyzeError("Pasted text is too long", 400);
  } else if (options.file) {
    if (options.file.bytes.length > demoLimits().maxUploadBytes) throw new AnalyzeError(uploadTooBigMessage(), 400);
    filename = options.file.filename.slice(0, 200) || "upload";
    const loaded = await fileToText(options.file);
    text = loaded.text;
    image = loaded.image;
    if (loaded.sparsePdf && !loaded.image) {
      throw new AnalyzeError("This PDF has no text layer, so no amount was read or guessed.", 422, "INSUFFICIENT");
    }
  } else if (!text.trim()) {
    throw new AnalyzeError("Upload an invoice or choose a sample", 400);
  }

  const context = await loadContext();
  const extracted = await extractInvoice({ text, image, filename });
  if (!extracted.invoice) {
    await recordInvocations(extracted.invocations);
    await recordAudit("extract.rejected", actor, extracted.error ?? "unreadable");
    throw new AnalyzeError(extracted.error ?? "The invoice could not be read", 422, "INSUFFICIENT");
  }
  const invoice = extracted.invoice;
  if (!canStore(invoice)) {
    await recordInvocations(extracted.invocations);
    await recordAudit("extract.rejected", actor, "fields are not storable without guessing");
    throw new AnalyzeError(
      "Required invoice fields are missing or not in minor-unit integers. Nothing was guessed.",
      422,
      "INSUFFICIENT",
    );
  }

  if (options.sample && invoice.supplierTaxId) {
    await voidReplayInvoices(context.businessId, invoice.supplierTaxId, invoice.invoiceNumber);
  }

  const counterpartyId = await findCounterpartyId(context.businessId, invoice.supplierTaxId, invoice.supplierLegalName);
  const duplicate = counterpartyId ? await hasActiveDuplicate(context.businessId, counterpartyId, invoice.invoiceNumber) : false;

  let retrieval;
  try {
    retrieval = await retrieveCounterparty(invoice.supplierLegalName, invoice.supplierTaxId);
  } catch (error) {
    const message = error instanceof TavilyError ? error.message : "Counterparty search failed";
    await recordAudit("retrieval.failed", actor, message.slice(0, 500));
    throw new AnalyzeError(message, 502);
  }

  const result = decide({
    invoice,
    businessCurrency: context.baseCurrency,
    assumptions: {
      cashInMinor: context.cashInMinor,
      cashOutOperatingMinor: context.cashOutOperatingMinor,
      principalDueMinor: context.principalDueMinor,
      interestDueMinor: context.interestDueMinor,
      currency: context.baseCurrency,
    },
    debtPresent: true,
    duplicateInvoice: duplicate,
    taxIdFound: retrieval.taxIdFound,
    taxIdStatus: retrieval.verified ? (retrieval.taxIdFound ? "found" : "missing") : "not_verified",
    priceCeilings: context.ceilings,
  });

  const explained = await explainResult(result, invoice);
  const saved = await persistAnalysis({
    idempotencyKey: options.idempotencyKey,
    actor,
    context,
    invoice,
    filename,
    duplicateAtDecision: duplicate,
    result,
    explanationTh: explained.th,
    explanationEn: explained.en,
    explanationSource: explained.source,
    retrieval,
    invocations: [...extracted.invocations, ...explained.invocations],
  });
  const decision = await getDecision(saved.decisionId);
  if (!decision) throw new AnalyzeError("The decision was saved but could not be read back", 500);
  return { decision, replayed: saved.replayed };
}

async function fileToText(file: { filename: string; mime: string; bytes: Buffer }): Promise<{
  text: string;
  image?: { mime: string; bytes: Buffer };
  sparsePdf?: boolean;
}> {
  const mime = file.mime.toLowerCase();
  const name = file.filename.toLowerCase();
  if (mime.startsWith("text/") || mime === "application/json" || name.endsWith(".txt") || name.endsWith(".json")) {
    return { text: file.bytes.toString("utf8") };
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    if (file.bytes.subarray(0, 4).toString() !== "%PDF") throw new AnalyzeError("The PDF header is not valid", 400);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");
    return { text, sparsePdf: text.replace(/\s/g, "").length < MIN_PDF_TEXT_CHARS };
  }
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || /\.(png|jpe?g|webp)$/.test(name)) {
    return { text: "", image: { mime: mime || "image/png", bytes: file.bytes } };
  }
  throw new AnalyzeError("Use a PDF, PNG, JPEG, WEBP, TXT, or JSON invoice", 400);
}

async function extractInvoice(input: {
  text: string;
  image?: { mime: string; bytes: Buffer };
  filename: string;
}): Promise<{ invoice: InvoiceInput | null; invocations: InvocationDraft[]; error?: string }> {
  const config = appConfig();
  if (!config.nebiusApiKey) {
    if (input.image) {
      return {
        invoice: null,
        invocations: [],
        error: "Demo mode cannot read images. Paste labeled text, upload a text invoice, or set NEBIUS_API_KEY.",
      };
    }
    const parsed = parseStrictInvoice(input.text);
    return {
      invoice: parsed.ok ? parsed.invoice : null,
      invocations: [
        {
          purpose: "extract",
          provider: "demo",
          modelId: "demo-strict-parser",
          accepted: parsed.ok,
          latencyMs: 0,
          error: parsed.ok ? null : parsed.reason,
          responseExcerpt: parsed.ok ? input.text.slice(0, 1500) : null,
          promptTokens: null,
          completionTokens: null,
        },
      ],
      error: parsed.ok ? undefined : "Demo mode only reads the labeled sample format or extract JSON. No amount was guessed.",
    };
  }

  const invocations: InvocationDraft[] = [];
  let text = input.text;
  try {
    if (input.image) {
      const transcribed = await nebiusChat({
        model: config.visionModel,
        messages: [
          { role: "system", content: TRANSCRIBE_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this invoice." },
              {
                type: "image_url",
                image_url: { url: `data:${input.image.mime};base64,${input.image.bytes.toString("base64")}` },
              },
            ],
          },
        ],
      });
      text = transcribed.text;
      const readable = hasInvoiceSignal(text);
      invocations.push({
        purpose: "transcribe",
        provider: "nebius",
        modelId: transcribed.model,
        accepted: readable,
        latencyMs: transcribed.latencyMs,
        error: readable ? null : "no_invoice_signal",
        responseExcerpt: text.slice(0, 2000),
        promptTokens: transcribed.usage.promptTokens,
        completionTokens: transcribed.usage.completionTokens,
      });
      if (!readable) return { invoice: null, invocations, error: UNREADABLE_INVOICE };
    }
    const userText = text.slice(0, 40_000);
    if (!hasInvoiceSignal(userText)) {
      return { invoice: null, invocations, error: UNREADABLE_INVOICE };
    }
    let parsed: ReturnType<typeof parseStrictInvoice> = { ok: false, reason: "not_called", missing: [] };
    let drift: string | null = null;
    let kept: InvoiceInput | null = null;
    const models = [config.extractModel, config.explainFallbackModel];
    for (let attempt = 0; attempt < models.length; attempt += 1) {
      const model = models[attempt] ?? config.extractModel;
      const correction =
        attempt === 0
          ? "Each LINE is line_no | description | quantity_millis | unit_price_minor | line_total_minor. Copy those integers unchanged. Do not multiply quantity_millis."
          : drift
            ? `${drift} Copy every printed integer again. Do not multiply or divide. Do not guess a missing amount.`
            : `The previous JSON failed schema check (${parsed.ok ? "unreadable" : parsed.reason}). Return only the JSON object. Copy printed integers exactly. Do not guess.`;
      let completion;
      try {
        completion = await nebiusChat({
          model,
          json: true,
          messages: [
            { role: "system", content: EXTRACT_SYSTEM },
            { role: "user", content: `${correction}\n\n${userText}` },
          ],
        });
      } catch (error) {
        if (error instanceof GuardError || error instanceof AnalyzeError) throw error;
        const message = error instanceof NebiusError ? error.message : "Nemotron extraction failed";
        invocations.push({
          purpose: "extract",
          provider: "nebius",
          modelId: model,
          accepted: false,
          latencyMs: null,
          error: message.slice(0, 500),
          responseExcerpt: null,
          promptTokens: null,
          completionTokens: null,
        });
        if (attempt === models.length - 1) {
          await recordInvocations(invocations);
          await recordAudit("extract.failed", "system", message.slice(0, 500));
          throw new AnalyzeError(message, 502);
        }
        parsed = { ok: false, reason: message.slice(0, 180), missing: [] };
        continue;
      }
      try {
        const payload = extractJsonObject(completion.text);
        parsed = parseStrictInvoice(JSON.stringify(payload));
      } catch (error) {
        parsed = { ok: false, reason: error instanceof Error ? error.message : "model_json_missing", missing: [] };
      }
      drift = parsed.ok ? labeledIntegerDrift(userText, parsed.invoice) : null;
      if (parsed.ok) kept = parsed.invoice;
      invocations.push({
        purpose: "extract",
        provider: "nebius",
        modelId: completion.model,
        accepted: parsed.ok && !drift,
        latencyMs: completion.latencyMs,
        error: parsed.ok ? drift : parsed.reason,
        responseExcerpt: completion.text.slice(0, 4000),
        promptTokens: completion.usage.promptTokens,
        completionTokens: completion.usage.completionTokens,
      });
      if (parsed.ok && !drift) return { invoice: parsed.invoice, invocations };
    }
    if (kept) return { invoice: kept, invocations };
    return { invoice: null, invocations, error: SCHEMA_REJECTED };
  } catch (error) {
    if (error instanceof AnalyzeError) throw error;
    if (error instanceof GuardError) {
      await recordInvocations(invocations);
      throw error;
    }
    const message = error instanceof NebiusError ? error.message : "Nemotron extraction failed";
    invocations.push({
      purpose: "extract",
      provider: "nebius",
      modelId: config.extractModel,
      accepted: false,
      latencyMs: null,
      error: message.slice(0, 500),
      responseExcerpt: null,
      promptTokens: null,
      completionTokens: null,
    });
    await recordInvocations(invocations);
    await recordAudit("extract.failed", "system", message.slice(0, 500));
    throw new AnalyzeError(message, 502);
  }
}

async function explainResult(
  result: ReturnType<typeof decide>,
  invoice: InvoiceInput,
): Promise<{ th: string; en: string; source: "model" | "template"; invocations: InvocationDraft[] }> {
  const template = templateExplanation(result, invoice);
  const config = appConfig();
  if (!config.nebiusApiKey) {
    return {
      th: template.th,
      en: template.en,
      source: "template",
      invocations: [
        {
          purpose: "explain",
          provider: "template",
          modelId: "deterministic-template",
          accepted: true,
          latencyMs: 0,
          error: null,
          responseExcerpt: null,
          promptTokens: null,
          completionTokens: null,
        },
      ],
    };
  }
  const payload = {
    outcome: result.outcome,
    winning_rule_id: result.winningRuleId,
    partial_amount_minor: result.partialAmountMinor?.toString() ?? null,
    fault_determination: result.faultDetermination,
    allowed_amounts: result.allowedAmounts.map((value) => value.toString()),
    evaluated_rules: RULE_IDS,
    template_th: template.th,
    template_en: template.en,
    findings: result.findings.map((finding) => ({
      rule_id: finding.ruleId,
      status: finding.status,
      detail_key: finding.detailKey,
    })),
    scenarios: result.scenarios.map((scenario) => ({
      kind: scenario.kind,
      decision_payment_minor: scenario.decisionPaymentMinor.toString(),
      cash_available_minor: scenario.cashAvailableMinor.toString(),
      dscr_micros: scenario.dscrMicros?.toString() ?? null,
      passes_dscr: scenario.passesDscr,
    })),
  };
  const exact = {
    summary_th: template.th,
    summary_en: template.en,
    cited_rule_ids: [result.winningRuleId],
    cited_amounts_minor: [],
  };
  const models = [config.explainModel];
  if (config.explainFallbackModel && config.explainFallbackModel !== config.explainModel) {
    models.push(config.explainFallbackModel);
  }
  const invocations: InvocationDraft[] = [];
  let rejection = "";
  try {
    for (const [index, model] of models.entries()) {
      const user =
        index === 0
          ? JSON.stringify(payload)
          : JSON.stringify({
              ...payload,
              previous_rejection: rejection,
              required_json: exact,
              instruction: "Return required_json exactly. Do not add digits, dates, or rule codes.",
            });
      const attempt = await attemptExplanation(model, user, result.allowedAmounts);
      invocations.push(attempt.invocation);
      if (attempt.draft && attempt.invocation.accepted) {
        return { th: attempt.draft.summaryTh, en: attempt.draft.summaryEn, source: "model", invocations };
      }
      rejection = attempt.invocation.error ?? "explanation_rejected";
    }
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    invocations.push({
      purpose: "explain",
      provider: "nebius",
      modelId: config.explainModel,
      accepted: false,
      latencyMs: null,
      error: error.message.slice(0, 500),
      responseExcerpt: null,
      promptTokens: null,
      completionTokens: null,
    });
  }
  return { th: template.th, en: template.en, source: "template", invocations };
}

async function attemptExplanation(
  model: string,
  user: string,
  allowedAmounts: readonly bigint[],
): Promise<{ draft?: ExplanationDraft; invocation: InvocationDraft }> {
  try {
    const completion = await nebiusChat({
      model,
      json: true,
      messages: [
        { role: "system", content: EXPLAIN_SYSTEM },
        { role: "user", content: user },
      ],
    });
    let draft: ExplanationDraft;
    try {
      draft = parseExplanation(completion.text);
    } catch (error) {
      return {
        invocation: {
          purpose: "explain",
          provider: "nebius",
          modelId: completion.model,
          accepted: false,
          latencyMs: completion.latencyMs,
          error: error instanceof Error ? error.message : "explanation_parse",
          responseExcerpt: completion.text.slice(0, 4000),
          promptTokens: completion.usage.promptTokens,
          completionTokens: completion.usage.completionTokens,
        },
      };
    }
    const validation = validateExplanation(draft, RULE_IDS, allowedAmounts);
    return {
      draft,
      invocation: {
        purpose: "explain",
        provider: "nebius",
        modelId: completion.model,
        accepted: validation.accepted,
        latencyMs: completion.latencyMs,
        error: validation.accepted ? null : validation.reasons.slice(0, 12).join("; "),
        responseExcerpt: completion.text.slice(0, 4000),
        promptTokens: completion.usage.promptTokens,
        completionTokens: completion.usage.completionTokens,
      },
    };
  } catch (error) {
    if (error instanceof GuardError) throw error;
    const message = error instanceof NebiusError ? error.message : "Nemotron explanation failed";
    return {
      invocation: {
        purpose: "explain",
        provider: "nebius",
        modelId: model,
        accepted: false,
        latencyMs: null,
        error: message.slice(0, 500),
        responseExcerpt: null,
        promptTokens: null,
        completionTokens: null,
      },
    };
  }
}

function labeledIntegerDrift(source: string, invoice: InvoiceInput): string | null {
  const printed: string[][] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("LINE:")) continue;
    const parts = line.slice("LINE:".length).split("|").map((part) => part.trim());
    if (parts.length === 5) printed.push(parts);
  }
  if (printed.length === 0 || printed.length !== invoice.lines.length) return null;
  for (let index = 0; index < printed.length; index += 1) {
    const parts = printed[index] ?? [];
    const line = invoice.lines[index];
    if (!line) return null;
    const expected: Array<[string, string, string]> = [
      ["quantity_millis", parts[2] ?? "", line.quantityMillis.toString()],
      ["unit_price_minor", parts[3] ?? "", line.unitPriceMinor.toString()],
      ["line_total_minor", parts[4] ?? "", line.lineTotalMinor.toString()],
    ];
    for (const [field, printedValue, copied] of expected) {
      if (printedValue !== copied) {
        return `LINE ${index + 1} ${field} is printed as ${printedValue}. The JSON returned ${copied}.`;
      }
    }
  }
  return null;
}

function parseExplanation(raw: string): ExplanationDraft {
  const data = extractJsonObject(raw) as Record<string, unknown>;
  const summary = typeof data.summary === "string" ? data.summary : "";
  const summaryTh = typeof data.summary_th === "string" && data.summary_th.trim() ? data.summary_th : summary;
  const summaryEn = typeof data.summary_en === "string" && data.summary_en.trim() ? data.summary_en : summary;
  if (!summaryTh.trim() || !summaryEn.trim()) throw new Error("explanation_incomplete");
  const citedRuleIds = Array.isArray(data.cited_rule_ids) ? data.cited_rule_ids.map(String) : [];
  const citedAmountsMinor = Array.isArray(data.cited_amounts_minor) ? data.cited_amounts_minor.map(asBig) : [];
  return { summaryTh, summaryEn, citedRuleIds, citedAmountsMinor };
}

function asBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error("cited_amount_not_integer");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function canStore(invoice: InvoiceInput): boolean {
  return (
    (invoice.currency === "THB" || invoice.currency === "USD") &&
    isIsoDate(invoice.issueDate) &&
    isIsoDate(invoice.dueDate) &&
    invoice.supplierLegalName.trim().length > 0 &&
    invoice.supplierLegalName.trim().length <= 300 &&
    invoice.invoiceNumber.trim().length > 0 &&
    invoice.subtotalMinor >= 0n &&
    invoice.vatMinor >= 0n &&
    invoice.totalMinor >= 0n &&
    Number.isInteger(invoice.vatRateBps) &&
    invoice.vatRateBps >= 0 &&
    invoice.vatRateBps <= 10000 &&
    Number.isInteger(invoice.extractionConfidenceBps) &&
    invoice.extractionConfidenceBps >= 0 &&
    invoice.extractionConfidenceBps <= 10000
  );
}
