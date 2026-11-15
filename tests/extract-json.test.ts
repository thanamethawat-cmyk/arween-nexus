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

describe("labeled LINE integer drift", () => {
  const source = invoiceToText(sampleInvoices.A);
  const rewritten = {
    ...sampleInvoices.A,
    lines: [
      { ...sampleInvoices.A.lines[0]!, quantityMillis: 1000n },
      { ...sampleInvoices.A.lines[1]! },
    ],
  };
  const dropped = {
    ...sampleInvoices.A,
    lines: [{ ...sampleInvoices.A.lines[0]! }],
  };

  it("returns null when JSON copies printed LINE integers", () => {
    expect(labeledIntegerDrift(source, sampleInvoices.A)).toBeNull();
  });

  it("flags a rewrite of LINE 1 quantity_millis from 100000 to 1000", () => {
    expect(labeledIntegerDrift(source, rewritten)).toBe(
      "LINE 1 quantity_millis is printed as 100000. The JSON returned 1000.",
    );
  });

  it("flags a dropped LINE row as drift", () => {
    expect(labeledIntegerDrift(source, dropped)).toBe("printed 2 LINE rows. The JSON returned 1.");
  });

  it("usableExtract is null for drifted or dropped rewrites and returns the invoice when drift is null", () => {
    expect(usableExtract(rewritten, labeledIntegerDrift(source, rewritten))).toBeNull();
    expect(usableExtract(dropped, labeledIntegerDrift(source, dropped))).toBeNull();
    expect(usableExtract(sampleInvoices.A, null)).toEqual(sampleInvoices.A);
    expect(usableExtract(null, null)).toBeNull();
  });
});
