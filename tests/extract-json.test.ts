import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { labeledIntegerDrift, parseStrictInvoice } from "../lib/extract/strict";
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

describe("labeled integer drift", () => {
  it("returns null when sample A LINE integers are copied exactly", () => {
    const source = invoiceToText(sampleInvoices.A);
    expect(labeledIntegerDrift(source, sampleInvoices.A)).toBeNull();
  });

  it("flags a changed unitPriceMinor on line 0", () => {
    const source = invoiceToText(sampleInvoices.A);
    const drifted = {
      ...sampleInvoices.A,
      lines: sampleInvoices.A.lines.map((line, index) =>
        index === 0 ? { ...line, unitPriceMinor: 99_999n } : line,
      ),
    };
    expect(labeledIntegerDrift(source, drifted)).toMatch(/unit_price_minor is printed as 25000/);
  });

  it("flags a dropped LINE row", () => {
    const source = invoiceToText(sampleInvoices.A);
    const dropped = { ...sampleInvoices.A, lines: sampleInvoices.A.lines.slice(0, 1) };
    expect(labeledIntegerDrift(source, dropped)).toMatch(/Printed LINE count is 2/);
  });

  it("returns null for a transcript without LINE rows", () => {
    expect(labeledIntegerDrift("Harbor Supplies invoice INV-1044 total 37450 THB", sampleInvoices.A)).toBeNull();
  });
});
