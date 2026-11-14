import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { parseStrictInvoice, printedPlainTotalDrift } from "../lib/extract/strict";
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

const unlabeledHarborPlain = [
  "TAX INVOICE",
  "Harbor Supplies Co., Ltd.",
  "Tax ID 0105560000001",
  "Invoice INV-1044",
  "Cartons 100 x 250 = 25000",
  "Tape rolls 20 x 500 = 10000",
  "Subtotal 35000",
  "VAT 7% 2450",
  "Total 37450 THB",
].join("\n");

const unlabeledHarborSpaced = [
  "TAX INVOICE",
  "Harbor Supplies Co., Ltd.",
  "Tax ID 0105560000001",
  "Invoice INV-1044",
  "Cartons 100 x 250 = 25 000",
  "Tape rolls 20 x 500 = 10 000",
  "Subtotal 35 000",
  "VAT 7% 2 450",
  "ยอดรวมทั้งสิ้น 37 450 บาท",
].join("\n");

const understatedHarbor = {
  ...sampleInvoices.A,
  subtotalMinor: 1_000_000n,
  vatMinor: 70_000n,
  totalMinor: 1_070_000n,
  lines: [
    {
      lineNo: 1,
      description: "Cartons",
      quantityMillis: 1_000n,
      unitPriceMinor: 1_000_000n,
      lineTotalMinor: 1_000_000n,
    },
  ],
};

describe("printed plain total drift", () => {
  it("returns null when sample A labeled integers are left to the labeled checker", () => {
    expect(printedPlainTotalDrift(invoiceToText(sampleInvoices.A), sampleInvoices.A)).toBeNull();
  });

  it("returns null when the extract total matches printed Total 37450", () => {
    expect(printedPlainTotalDrift(unlabeledHarborPlain, sampleInvoices.A)).toBeNull();
  });

  it("returns null when the extract total matches a space-grouped ยอดรวมทั้งสิ้น 37 450", () => {
    expect(printedPlainTotalDrift(unlabeledHarborSpaced, sampleInvoices.A)).toBeNull();
  });

  it("flags a schema-valid 10,700 rewrite of an unlabeled Total 37450 invoice", () => {
    expect(printedPlainTotalDrift(unlabeledHarborPlain, understatedHarbor)).toMatch(
      /Printed amount 3745000 minor units is larger than JSON total_minor 1070000/,
    );
  });

  it("flags a 10,700 rewrite of a space-grouped 37 450 total", () => {
    expect(printedPlainTotalDrift(unlabeledHarborSpaced, understatedHarbor)).toMatch(
      /Printed amount 3745000 minor units is larger than JSON total_minor 1070000/,
    );
  });

  it("does not treat comma-grouped 37,450.00 as a plain total", () => {
    const commaHarbor = [
      "TAX INVOICE",
      "Harbor Supplies Co., Ltd.",
      "Invoice INV-1044",
      "Total 37,450.00 THB",
    ].join("\n");
    expect(printedPlainTotalDrift(commaHarbor, understatedHarbor)).toBeNull();
  });
});
