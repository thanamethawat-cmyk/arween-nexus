import type { InvoiceInput, InvoiceLineInput } from "../engine/types";

export type StrictParseResult =
  | { ok: true; invoice: InvoiceInput }
  | { ok: false; reason: string; missing: string[] };

const REQUIRED = [
  "SUPPLIER",
  "COUNTRY",
  "INVOICE_NUMBER",
  "ISSUE_DATE",
  "DUE_DATE",
  "CURRENCY",
  "VAT_RATE_BPS",
  "SUBTOTAL_MINOR",
  "VAT_MINOR",
  "TOTAL_MINOR",
  "CONFIDENCE_BPS",
] as const;

/** Reads an explicit labeled invoice. It copies integers; it does not calculate totals. */
export function parseStrictInvoice(text: string): StrictParseResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return parseJsonInvoice(trimmed);

  const fields = new Map<string, string>();
  const lines: InvoiceLineInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("LINE:")) {
      const parsed = parseLine(line.slice("LINE:".length));
      if (!parsed) return { ok: false, reason: "malformed_line", missing: ["lines"] };
      lines.push(parsed);
      continue;
    }
    const splitAt = line.indexOf(":");
    if (splitAt < 0) return { ok: false, reason: "malformed_field", missing: [line] };
    fields.set(line.slice(0, splitAt).trim().toUpperCase(), line.slice(splitAt + 1).trim());
  }

  const missing: string[] = REQUIRED.filter((key) => !fields.get(key));
  if (lines.length === 0) missing.push("LINE");
  if (missing.length) return { ok: false, reason: "missing_fields", missing: [...missing] };

  try {
    const tax = fields.get("TAX_ID")?.trim() ?? "";
    return {
      ok: true,
      invoice: {
        supplierLegalName: fields.get("SUPPLIER") ?? "",
        supplierTaxId: tax.length ? tax : null,
        supplierCountryCode: fields.get("COUNTRY") ?? "",
        invoiceNumber: fields.get("INVOICE_NUMBER") ?? "",
        issueDate: fields.get("ISSUE_DATE") ?? "",
        dueDate: fields.get("DUE_DATE") ?? "",
        currency: fields.get("CURRENCY") ?? "",
        vatRateBps: parseIntStrict(fields.get("VAT_RATE_BPS") ?? ""),
        subtotalMinor: parseBig(fields.get("SUBTOTAL_MINOR") ?? ""),
        vatMinor: parseBig(fields.get("VAT_MINOR") ?? ""),
        totalMinor: parseBig(fields.get("TOTAL_MINOR") ?? ""),
        extractionConfidenceBps: parseIntStrict(fields.get("CONFIDENCE_BPS") ?? ""),
        lines,
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "parse_error", missing: [] };
  }
}

function parseLine(body: string): InvoiceLineInput | null {
  const parts = body.split("|").map((part) => part.trim());
  if (parts.length !== 5) return null;
  try {
    return {
      lineNo: parseIntStrict(parts[0] ?? ""),
      description: parts[1] ?? "",
      quantityMillis: parseBig(parts[2] ?? ""),
      unitPriceMinor: parseBig(parts[3] ?? ""),
      lineTotalMinor: parseBig(parts[4] ?? ""),
    };
  } catch {
    return null;
  }
}

function parseBig(value: string): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error("not_integer");
  return BigInt(value);
}

function parseIntStrict(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error("not_integer");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("unsafe_integer");
  return parsed;
}

function parseJsonInvoice(text: string): StrictParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json", missing: [] };
  }
  if (!data || typeof data !== "object") return { ok: false, reason: "invalid_json", missing: [] };
  const row = data as Record<string, unknown>;
  const missing: string[] = [];
  const need = [
    "supplier_legal_name",
    "invoice_number",
    "issue_date",
    "due_date",
    "currency",
    "vat_rate_bps",
    "subtotal_minor",
    "vat_minor",
    "total_minor",
    "extraction_confidence_bps",
    "lines",
  ];
  for (const key of need) {
    if (row[key] === undefined || row[key] === null || row[key] === "") missing.push(key);
  }
  if (missing.length) return { ok: false, reason: "missing_fields", missing };
  if (!Array.isArray(row.lines) || row.lines.length === 0) {
    return { ok: false, reason: "missing_fields", missing: ["lines"] };
  }
  try {
    const lines = row.lines.map((line) => {
      const item = line as Record<string, unknown>;
      return {
        lineNo: asInt(item.line_no),
        description: String(item.description ?? ""),
        quantityMillis: asBig(item.quantity_millis),
        unitPriceMinor: asBig(item.unit_price_minor),
        lineTotalMinor: asBig(item.line_total_minor),
      };
    });
    const tax = row.supplier_tax_id == null ? "" : String(row.supplier_tax_id);
    return {
      ok: true,
      invoice: {
        supplierLegalName: String(row.supplier_legal_name),
        supplierTaxId: tax.trim() ? tax.trim() : null,
        supplierCountryCode: String(row.supplier_country_code ?? ""),
        invoiceNumber: String(row.invoice_number),
        issueDate: String(row.issue_date),
        dueDate: String(row.due_date),
        currency: String(row.currency),
        vatRateBps: asInt(row.vat_rate_bps),
        subtotalMinor: asBig(row.subtotal_minor),
        vatMinor: asBig(row.vat_minor),
        totalMinor: asBig(row.total_minor),
        extractionConfidenceBps: asInt(row.extraction_confidence_bps),
        lines,
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "parse_error", missing: [] };
  }
}

function asBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("unsafe_integer");
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error("not_integer");
}

function asInt(value: unknown): number {
  const parsed = asBig(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("unsafe_integer");
  }
  return Number(parsed);
}

/** Labeled paste already has TOTAL_MINOR:; those integers are a separate check. */
const LABELED_TOTAL_RE = /(?:^|\n)\s*TOTAL_MINOR\s*:/;

/**
 * Vision/OCR often reads the thousands comma in "Total 37,450" as a period: "Total 37.450".
 * European invoices also print 37.450 or 37.450,00. Require 3-digit groups so cents like
 * 37.45 are not treated as 3,745. Do not match comma-grouped 37,450 — that is a separate check.
 */
const PRINTED_DOT_GROUPED_TOTAL_RE =
  /(?:total|amount\s*due|grand\s*total|ยอดรวม(?:ทั้งสิ้น)?|รวมทั้งสิ้น)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+)(?:,(\d{2}))?(?!\d)/gi;

function dotGroupedTotalMinor(wholeToken: string, cents: string | undefined): bigint | null {
  const cleaned = wholeToken.replace(/\./g, "");
  if (!/^\d{4,7}$/.test(cleaned)) return null;
  const satang = cents && /^\d{2}$/.test(cents) ? BigInt(cents) : 0n;
  return BigInt(cleaned) * 100n + satang;
}

/**
 * When a vision/OCR transcript prints "Total 37.450" but the extract JSON uses a smaller
 * internally consistent total, PAY uses the rewrite. Labeled TOTAL_MINOR integers skip this.
 */
export function printedDotGroupedTotalDrift(source: string, invoice: InvoiceInput): string | null {
  if (LABELED_TOTAL_RE.test(source)) return null;

  const printed: bigint[] = [];
  for (const match of source.matchAll(PRINTED_DOT_GROUPED_TOTAL_RE)) {
    const token = match[1];
    if (!token) continue;
    const minor = dotGroupedTotalMinor(token, match[2]);
    if (minor !== null) printed.push(minor);
  }
  if (printed.length === 0) return null;

  let max = printed[0] ?? 0n;
  for (const value of printed) {
    if (value > max) max = value;
  }
  if (invoice.totalMinor === max) return null;
  return `Printed amount ${max.toString()} minor units is larger than JSON total_minor ${invoice.totalMinor.toString()}.`;
}
