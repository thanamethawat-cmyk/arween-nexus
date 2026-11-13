import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { labeledIdentityDrift, parseStrictInvoice } from "../lib/extract/strict";
import { invoiceToText, sampleInvoices } from "../lib/samples";

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

describe("labeled identity drift", () => {
  it("returns null when sample A invoice number and tax id are copied exactly", () => {
    expect(labeledIdentityDrift(invoiceToText(sampleInvoices.A), sampleInvoices.A)).toBeNull();
  });

  it("flags a rewritten invoice number that would skip the duplicate rule", () => {
    const renamed = { ...sampleInvoices.A, invoiceNumber: "INV-1044-A" };
    expect(labeledIdentityDrift(invoiceToText(sampleInvoices.A), renamed)).toMatch(
      /INVOICE_NUMBER is printed as INV-1044\. The JSON returned INV-1044-A\./,
    );
  });

  it("flags a rewritten tax id", () => {
    const otherTax = { ...sampleInvoices.A, supplierTaxId: "0105590009001" };
    expect(labeledIdentityDrift(invoiceToText(sampleInvoices.A), otherTax)).toMatch(
      /TAX_ID is printed as 0105560000001\. The JSON returned 0105590009001\./,
    );
  });

  it("returns null for a transcript without labeled identity fields", () => {
    expect(
      labeledIdentityDrift("Harbor Supplies invoice total 37,450.00 THB", sampleInvoices.A),
    ).toBeNull();
  });
});
