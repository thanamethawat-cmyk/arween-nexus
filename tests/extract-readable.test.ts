import { describe, expect, it } from "vitest";
import { hasInvoiceSignal } from "../lib/extract/readable";
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
