import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { parseStrictInvoice, printedIdentityDrift } from "../lib/extract/strict";
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

const unlabeledHarbor = [
  "TAX INVOICE",
  "Harbor Supplies Co., Ltd.",
  "Tax ID 0105560000001",
  "Invoice INV-1044",
  "Cartons 100 x 250.00 = 25,000.00",
  "Tape rolls 20 x 500.00 = 10,000.00",
  "Subtotal 35,000.00",
  "VAT 7% 2,450.00",
  "Total 37,450.00 THB",
].join("\n");

describe("printed identity drift", () => {
  it("returns null when labeled sample identity is left to the labeled checker", () => {
    expect(printedIdentityDrift(invoiceToText(sampleInvoices.A), sampleInvoices.A)).toBeNull();
  });

  it("returns null when the extract copies INV-1044 and the printed tax id", () => {
    expect(printedIdentityDrift(unlabeledHarbor, sampleInvoices.A)).toBeNull();
  });

  it("flags a rewritten invoice number that would skip the duplicate rule", () => {
    const renamed = { ...sampleInvoices.A, invoiceNumber: "INV-1044-A" };
    expect(printedIdentityDrift(unlabeledHarbor, renamed)).toMatch(
      /Printed invoice number INV-1044 was rewritten as INV-1044-A\./,
    );
  });

  it("flags a rewritten tax id that would create a second counterparty", () => {
    const otherTax = { ...sampleInvoices.A, supplierTaxId: "0105590009001" };
    expect(printedIdentityDrift(unlabeledHarbor, otherTax)).toMatch(
      /Printed tax id 0105560000001 was rewritten as 0105590009001\./,
    );
  });

  it("flags a dropped tax id", () => {
    const dropped = { ...sampleInvoices.A, supplierTaxId: null };
    expect(printedIdentityDrift(unlabeledHarbor, dropped)).toMatch(
      /Printed tax id 0105560000001 was rewritten as \(empty\)\./,
    );
  });

  it("reads a Thai เลขที่ invoice number", () => {
    const thai = "เลขที่ INV-1044\nเลขประจำตัวผู้เสียภาษี 0105560000001\nยอดรวมทั้งสิ้น 37,450.00 บาท";
    const renamed = { ...sampleInvoices.A, invoiceNumber: "INV-2208" };
    expect(printedIdentityDrift(thai, renamed)).toMatch(/INV-1044 was rewritten as INV-2208/);
  });
});
