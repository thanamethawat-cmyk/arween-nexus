/** True when the transcript looks like it contains a printed invoice, not a blank page. */
export function hasInvoiceSignal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.replace(/\s/g, "").length < 20) return false;
  if (/\b(SUBTOTAL_MINOR|TOTAL_MINOR|VAT_MINOR|INVOICE_NUMBER|CONFIDENCE_BPS)\b/.test(trimmed)) return true;
  if (/\d{1,3}(?:,\d{3})+(?:\.\d{2})?/.test(trimmed)) return true;
  if (/\d+\.\d{2}\b/.test(trimmed)) return true;
  if (/\b\d{4,}\b/.test(trimmed) && /(invoice|total|amount|บาท|ภาษี|qty|quantity|tax\s*id|เลขที่|ยอดรวม)/i.test(trimmed)) {
    return true;
  }
  return false;
}

export const UNREADABLE_INVOICE =
  "No invoice amounts were readable in this file. No amount was guessed.";

export const SCHEMA_REJECTED =
  "The invoice fields could not be read. No amount was guessed.";

/**
 * Longest transcript sent to the extractor. The paste cap is larger (200k), so a silent
 * slice would drop later LINE rows while labeledIntegerDrift only sees the prefix.
 */
export const MAX_EXTRACT_SOURCE_CHARS = 40_000;

export const SOURCE_TRUNCATED =
  "This invoice is too long to read without dropping later amounts. No amount was guessed.";

export function extractSourceForModel(text: string): { ok: true; text: string } | { ok: false; error: string } {
  if (text.length > MAX_EXTRACT_SOURCE_CHARS) {
    return { ok: false, error: SOURCE_TRUNCATED };
  }
  return { ok: true, text };
}
