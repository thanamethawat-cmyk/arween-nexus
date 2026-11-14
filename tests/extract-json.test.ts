import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { parseStrictInvoice, printedCurrencyDrift } from "../lib/extract/strict";
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

const unlabeledHarborThb = [
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

const unlabeledUsd = [
  "INVOICE",
  "Harbor Supplies Co., Ltd.",
  "Invoice INV-1044",
  "Consulting 1 x 10,700.00 = 10,700.00",
  "Total 10,700.00 USD",
].join("\n");

describe("printed currency drift", () => {
  it("returns null when labeled sample currency is left to the labeled checker", () => {
    expect(printedCurrencyDrift(invoiceToText(sampleInvoices.A), sampleInvoices.A)).toBeNull();
  });

  it("returns null when the extract copies THB from an unlabeled total line", () => {
    expect(printedCurrencyDrift(unlabeledHarborThb, sampleInvoices.A)).toBeNull();
  });

  it("flags a USD invoice rewritten as THB so PAY would use the wrong unit", () => {
    expect(printedCurrencyDrift(unlabeledUsd, sampleInvoices.A)).toMatch(
      /Printed currency USD was rewritten as THB\./,
    );
  });

  it("flags a บาท total rewritten as USD", () => {
    const thai = "ยอดรวมทั้งสิ้น 37,450.00 บาท";
    const asUsd = { ...sampleInvoices.A, currency: "USD" };
    expect(printedCurrencyDrift(thai, asUsd)).toMatch(/Printed currency THB was rewritten as USD\./);
  });

  it("flags a $ amount rewritten as THB", () => {
    expect(printedCurrencyDrift("Total $10,700.00", sampleInvoices.A)).toMatch(
      /Printed currency USD was rewritten as THB\./,
    );
  });
});
