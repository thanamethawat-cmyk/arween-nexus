import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/extract/json";
import { labeledIntegerDrift, parseStrictInvoice, usableExtract } from "../lib/extract/strict";
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

const rewrittenLineAmounts = {
  ...sampleInvoices.A,
  lines: sampleInvoices.A.lines.map((line, index) =>
    index === 0
      ? { ...line, quantityMillis: 1_000n, unitPriceMinor: 1_000_000n, lineTotalMinor: 1_000_000n }
      : line,
  ),
};

const droppedLineRewrite = {
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

describe("labeled LINE drift", () => {
  it("returns null when extractor LINE integers match the paste", () => {
    expect(labeledIntegerDrift(invoiceToText(sampleInvoices.A), sampleInvoices.A)).toBeNull();
  });

  it("flags a rewrite of a printed LINE amount", () => {
    const source = invoiceToText(sampleInvoices.A);
    expect(labeledIntegerDrift(source, rewrittenLineAmounts)).toBe(
      "LINE 1 quantity_millis is printed as 100000. The JSON returned 1000.",
    );
  });

  it("flags a schema-valid extract that dropped a labeled LINE row", () => {
    const source = invoiceToText(sampleInvoices.A);
    expect(labeledIntegerDrift(source, droppedLineRewrite)).toBe(
      "printed 2 LINE rows. The JSON returned 1.",
    );
  });

  it("does not fall back to a drifted extract after retries", () => {
    const source = invoiceToText(sampleInvoices.A);
    const amountDrift = labeledIntegerDrift(source, rewrittenLineAmounts);
    const droppedDrift = labeledIntegerDrift(source, droppedLineRewrite);
    expect(usableExtract(rewrittenLineAmounts, amountDrift)).toBeNull();
    expect(usableExtract(droppedLineRewrite, droppedDrift)).toBeNull();
    expect(usableExtract(sampleInvoices.A, labeledIntegerDrift(source, sampleInvoices.A))).toBe(
      sampleInvoices.A,
    );
  });
});
