import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { compactInvoiceNumber, foldInvoiceNumberSeparators, parseStrictInvoice } from "../lib/extract/strict";

const invoice = {
  supplier_legal_name: "Harbor Supplies Co., Ltd.",
  supplier_tax_id: "0105560000001",
  supplier_country_code: "TH",
  invoice_number: "INV-1044",
  issue_date: "2026-10-01",
  due_date: "2026-10-15",
  currency: "THB",
  vat_rate_bps: 700,
  subtotal_minor: "3500000",
  vat_minor: "245000",
  total_minor: "3745000",
  extraction_confidence_bps: 9600,
  lines: [
    { line_no: 1, description: "Cartons", quantity_millis: "100000", unit_price_minor: "25000", line_total_minor: "2500000" },
  ],
};

describe("model JSON extraction", () => {
  it("strips think tags and markdown fences and keeps the invoice object", () => {
    const wrapped = `<think>{"total_minor":"1"}</think>\n\`\`\`json\n${JSON.stringify(invoice)}\n\`\`\``;
    const parsed = parseStrictInvoice(JSON.stringify(extractJsonObject(wrapped)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.invoice.totalMinor).toBe(3745000n);
  });

  it("reads JSON after an unclosed think tag without using the thought's amount", () => {
    const text = `<think>The total might be 999\n${JSON.stringify(invoice)}`;
    const parsed = parseStrictInvoice(JSON.stringify(extractJsonObject(text)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.invoice.invoiceNumber).toBe("INV-1044");
  });

  it("folds slash, dot, underscore, and dropped-hyphen invoice numbers onto INV-1044", () => {
    expect(foldInvoiceNumberSeparators("INV/1044")).toBe("INV-1044");
    expect(foldInvoiceNumberSeparators("INV.1044")).toBe("INV-1044");
    expect(foldInvoiceNumberSeparators("INV_1044")).toBe("INV-1044");
    expect(foldInvoiceNumberSeparators("INV1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV/1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV.1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV_1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV-1044")).toBe("INV1044");
    expect(compactInvoiceNumber("INV-1045")).toBe("INV1045");
    const slashed = { ...invoice, invoice_number: "INV/1044" };
    const dotted = { ...invoice, invoice_number: "INV.1044" };
    const underscored = { ...invoice, invoice_number: "INV_1044" };
    const dropped = { ...invoice, invoice_number: "INV1044" };
    for (const payload of [slashed, dotted, underscored]) {
      const parsed = parseStrictInvoice(JSON.stringify(payload));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.invoice.invoiceNumber).toBe("INV-1044");
    }
    const parsedDropped = parseStrictInvoice(JSON.stringify(dropped));
    expect(parsedDropped.ok).toBe(true);
    if (parsedDropped.ok) {
      expect(parsedDropped.invoice.invoiceNumber).toBe("INV1044");
      expect(compactInvoiceNumber(parsedDropped.invoice.invoiceNumber)).toBe(
        compactInvoiceNumber("INV-1044"),
      );
    }
    const labeled = parseStrictInvoice(`SUPPLIER: Harbor Supplies Co., Ltd.
TAX_ID: 0105560000001
COUNTRY: TH
INVOICE_NUMBER: INV/1044
ISSUE_DATE: 2026-10-01
DUE_DATE: 2026-10-15
CURRENCY: THB
VAT_RATE_BPS: 700
SUBTOTAL_MINOR: 3500000
VAT_MINOR: 245000
TOTAL_MINOR: 3745000
CONFIDENCE_BPS: 9600
LINE: 1 | Cartons | 100000 | 25000 | 2500000`);
    expect(labeled.ok).toBe(true);
    if (labeled.ok) expect(labeled.invoice.invoiceNumber).toBe("INV-1044");
  });

  it("does not invent an amount when the object is missing money fields", () => {
    const thin = extractJsonObject('{"invoice_number":"INV-1","supplier_legal_name":"A"}');
    const parsed = parseStrictInvoice(JSON.stringify(thin));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("missing_fields");
  });
});
