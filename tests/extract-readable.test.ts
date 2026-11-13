import { describe, expect, it } from "vitest";
import {
  extractSourceForModel,
  hasInvoiceSignal,
  MAX_EXTRACT_SOURCE_CHARS,
  SOURCE_TRUNCATED,
} from "../lib/extract/readable";
import { invoiceToText, sampleInvoices } from "../lib/samples";

describe("invoice readability signal", () => {
  it("accepts labeled samples and human totals", () => {
    expect(hasInvoiceSignal(invoiceToText(sampleInvoices.A))).toBe(true);
    expect(hasInvoiceSignal("Total 37,450.00 THB\nTax ID 0105560000001\nInvoice INV-1")).toBe(true);
    expect(hasInvoiceSignal("ยอดรวมทั้งสิ้น 37,450.00 บาท")).toBe(true);
  });

  it("rejects blank-page and empty extractor placeholders", () => {
    expect(hasInvoiceSignal("")).toBe(false);
    expect(hasInvoiceSignal("No text was extracted from the file.")).toBe(false);
    expect(
      hasInvoiceSignal("The provided image is a blank white page and contains no invoice or text to transcribe."),
    ).toBe(false);
  });
});

function labeledLineCount(source: string): number {
  return source.split(/\r?\n/).filter((line) => {
    const parts = line.trim().slice("LINE:".length).split("|");
    return line.trim().startsWith("LINE:") && parts.length === 5;
  }).length;
}

describe("extract source window", () => {
  it("keeps a labeled sample intact", () => {
    const source = invoiceToText(sampleInvoices.A);
    expect(extractSourceForModel(source)).toEqual({ ok: true, text: source });
  });

  it("refuses a long invoice instead of clipping later LINE rows", () => {
    const extra = "LINE: 99 | Extra cartons | 1000 | 100000 | 100000\n";
    const source = `${invoiceToText(sampleInvoices.A)}\n${extra.repeat(900)}`;
    expect(source.length).toBeGreaterThan(MAX_EXTRACT_SOURCE_CHARS);
    expect(labeledLineCount(source.slice(0, MAX_EXTRACT_SOURCE_CHARS))).toBeLessThan(labeledLineCount(source));
    const window = extractSourceForModel(source);
    expect(window.ok).toBe(false);
    if (!window.ok) expect(window.error).toBe(SOURCE_TRUNCATED);
  });
});
