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
