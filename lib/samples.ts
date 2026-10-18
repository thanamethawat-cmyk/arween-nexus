import type { InvoiceInput } from "./engine/types";

export type SampleId = "A" | "B" | "C";

const harbor = {
  supplierLegalName: "Harbor Supplies Co., Ltd.",
  supplierTaxId: "0105560000001",
  supplierCountryCode: "TH",
};

export const VANTA_TAX_ID = "0105590009001";

export const sampleInvoices: Record<SampleId, InvoiceInput> = {
  A: {
    ...harbor,
    invoiceNumber: "INV-1044",
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    currency: "THB",
    vatRateBps: 700,
    subtotalMinor: 3_500_000n,
    vatMinor: 245_000n,
    totalMinor: 3_745_000n,
    extractionConfidenceBps: 9600,
    lines: [
      { lineNo: 1, description: "Cartons", quantityMillis: 100_000n, unitPriceMinor: 25_000n, lineTotalMinor: 2_500_000n },
      { lineNo: 2, description: "Tape rolls", quantityMillis: 20_000n, unitPriceMinor: 50_000n, lineTotalMinor: 1_000_000n },
    ],
  },
  B: {
    ...harbor,
    invoiceNumber: "INV-2208",
    issueDate: "2026-10-08",
    dueDate: "2026-10-22",
    currency: "THB",
    vatRateBps: 700,
    subtotalMinor: 5_607_477n,
    vatMinor: 392_523n,
    totalMinor: 6_000_000n,
    extractionConfidenceBps: 9400,
    lines: [
      {
        lineNo: 1,
        description: "Seasonal stock",
        quantityMillis: 1_000n,
        unitPriceMinor: 5_607_477n,
        lineTotalMinor: 5_607_477n,
      },
    ],
  },
  C: {
    supplierLegalName: "Vanta Commerce Co., Ltd.",
    supplierTaxId: VANTA_TAX_ID,
    supplierCountryCode: "TH",
    invoiceNumber: "INV-9001",
    issueDate: "2026-10-12",
    dueDate: "2026-10-26",
    currency: "THB",
    vatRateBps: 700,
    subtotalMinor: 5_607_477n,
    vatMinor: 392_523n,
    totalMinor: 6_000_000n,
    extractionConfidenceBps: 9100,
    lines: [
      {
        lineNo: 1,
        description: "Consulting retainer",
        quantityMillis: 1_000n,
        unitPriceMinor: 5_000_000n,
        lineTotalMinor: 5_000_000n,
      },
    ],
  },
};

export function invoiceToText(invoice: InvoiceInput): string {
  const lines = invoice.lines
    .map(
      (line) =>
        `LINE: ${line.lineNo} | ${line.description} | ${line.quantityMillis.toString()} | ${line.unitPriceMinor.toString()} | ${line.lineTotalMinor.toString()}`,
    )
    .join("\n");
  return [
    `SUPPLIER: ${invoice.supplierLegalName}`,
    `TAX_ID: ${invoice.supplierTaxId ?? ""}`,
    `COUNTRY: ${invoice.supplierCountryCode}`,
    `INVOICE_NUMBER: ${invoice.invoiceNumber}`,
    `ISSUE_DATE: ${invoice.issueDate}`,
    `DUE_DATE: ${invoice.dueDate}`,
    `CURRENCY: ${invoice.currency}`,
    `VAT_RATE_BPS: ${invoice.vatRateBps}`,
    `SUBTOTAL_MINOR: ${invoice.subtotalMinor.toString()}`,
    `VAT_MINOR: ${invoice.vatMinor.toString()}`,
    `TOTAL_MINOR: ${invoice.totalMinor.toString()}`,
    `CONFIDENCE_BPS: ${invoice.extractionConfidenceBps}`,
    lines,
  ].join("\n");
}

export const SPEC_ASSUMPTIONS = {
  cashInMinor: 25_000_000n,
  cashOutOperatingMinor: 8_000_000n,
  principalDueMinor: 8_000_000n,
  interestDueMinor: 2_000_000n,
  currency: "THB" as const,
};
