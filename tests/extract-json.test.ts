import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { foldInvoiceNumberLabels, parseStrictInvoice } from "../lib/extract/strict";

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

  it("does not invent an amount when the object is missing money fields", () => {
    const thin = extractJsonObject('{"invoice_number":"INV-1","supplier_legal_name":"A"}');
    const parsed = parseStrictInvoice(JSON.stringify(thin));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("missing_fields");
  });
});

describe("invoice number label prefixes", () => {
  it("strips printed Invoice No. / # / เลขที่ labels down to INV-1044", () => {
    expect(foldInvoiceNumberLabels("INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("No. INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("NO INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("#INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("Invoice No. INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("Invoice INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("Invoice #INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("เลขที่ INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("No. #INV-1044")).toBe("INV-1044");
  });

  it("does not strip INV-1044 or INVOICE-1044 as if they were labels", () => {
    expect(foldInvoiceNumberLabels("INV-1044")).toBe("INV-1044");
    expect(foldInvoiceNumberLabels("INVOICE-1044")).toBe("INVOICE-1044");
  });

  it("parses JSON invoice_number prefixes to the stored Harbor number", () => {
    for (const invoiceNumber of ["No. INV-1044", "#INV-1044", "Invoice No. INV-1044", "เลขที่ INV-1044"]) {
      const parsed = parseStrictInvoice(JSON.stringify({ ...invoice, invoice_number: invoiceNumber }));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.invoice.invoiceNumber).toBe("INV-1044");
    }
  });
});
