import { describe, expect, it } from "vitest";
import { decide } from "../lib/engine/decide";
import { formatDscr } from "../lib/engine/format";
import { validateExplanation } from "../lib/engine/hallucination";
import {
  debtServiceMinor,
  dscrMicros,
  maxPaymentMinor,
  minAvailableMinor,
  splitFiftyFifty,
  divRoundHalfUp,
} from "../lib/engine/money";
import { templateExplanation } from "../lib/engine/templates";
import { RULE_IDS, type DecideInput } from "../lib/engine/types";
import { parseStrictInvoice } from "../lib/extract/strict";
import { SPEC_ASSUMPTIONS, invoiceToText, sampleInvoices } from "../lib/samples";
import { buildRetrievalQuery } from "../lib/tavily/query";

function inputFor(sample: "A" | "B" | "C", overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    invoice: sampleInvoices[sample],
    businessCurrency: "THB",
    assumptions: SPEC_ASSUMPTIONS,
    debtPresent: true,
    duplicateInvoice: sample === "C",
    taxIdFound: sample !== "C",
    priceCeilings: [{ descriptionKey: "Cartons", ceilingUnitPriceMinor: 30_000n }],
    ...overrides,
  };
}

describe("spec shared liquidity figures", () => {
  it("matches the master cash, debt, and DSCR ceiling", () => {
    const debt = debtServiceMinor(SPEC_ASSUMPTIONS.principalDueMinor, SPEC_ASSUMPTIONS.interestDueMinor);
    expect(debt).toBe(10_000_000n);
    expect(minAvailableMinor(debt)).toBe(12_500_000n);
    expect(
      maxPaymentMinor(SPEC_ASSUMPTIONS.cashInMinor, SPEC_ASSUMPTIONS.cashOutOperatingMinor, debt),
    ).toBe(4_500_000n);
  });

  it("rounds half up on non-negative integers", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(1n, 2n)).toBe(1n);
    expect(divRoundHalfUp(2_450_000_000n, 10_000n)).toBe(245_000n);
  });
});

describe("case A — PAY", () => {
  const result = decide(inputFor("A"));
  const paid = result.scenarios.find((scenario) => scenario.kind === "paid_full");

  it("pays in full under RULE-PAY-001 with DSCR 1.3255", () => {
    expect(result.outcome).toBe("PAY");
    expect(result.winningRuleId).toBe("RULE-PAY-001");
    expect(result.partialAmountMinor).toBeNull();
    expect(result.faultDetermination).toBe("NOT_PERFORMED");
    expect(paid?.cashAvailableMinor).toBe(13_255_000n);
    expect(paid?.dscrMicros).toBe(1_325_500n);
    expect(paid ? formatDscr(paid.dscrMicros!) : "").toBe("1.3255");
    expect(paid?.passesDscr).toBe(true);
    expect(result.maxPaymentMinor).toBe(4_500_000n);
    expect(result.scenarios.map((scenario) => scenario.kind)).toEqual(["held", "paid_full", "partial_max"]);
  });
});

describe("case B — PARTIAL", () => {
  const result = decide(inputFor("B"));
  const paid = result.scenarios.find((scenario) => scenario.kind === "paid_full");
  const partial = result.scenarios.find((scenario) => scenario.kind === "partial_max");

  it("caps payment at 45,000 THB under RULE-DSCR-001", () => {
    expect(result.outcome).toBe("PARTIAL");
    expect(result.winningRuleId).toBe("RULE-DSCR-001");
    expect(result.partialAmountMinor).toBe(4_500_000n);
    expect(paid?.cashAvailableMinor).toBe(11_000_000n);
    expect(paid?.dscrMicros).toBe(1_100_000n);
    expect(paid?.passesDscr).toBe(false);
    expect(partial?.decisionPaymentMinor).toBe(4_500_000n);
    expect(partial?.cashAvailableMinor).toBe(12_500_000n);
    expect(partial?.dscrMicros).toBe(1_250_000n);
    expect(partial?.passesDscr).toBe(true);
  });
});

describe("case C — HOLD", () => {
  const result = decide(inputFor("C"));

  it("holds on RULE-INV-001 and records the four blocking failures", () => {
    expect(result.outcome).toBe("HOLD");
    expect(result.winningRuleId).toBe("RULE-INV-001");
    expect(result.partialAmountMinor).toBeNull();
    const failed = result.findings.filter((row) => row.status === "fail").map((row) => row.ruleId);
    expect(failed).toEqual([
      "RULE-INV-001",
      "RULE-INV-002",
      "RULE-WEB-001",
      "RULE-DSCR-001",
      "RULE-PAY-001",
    ]);
    for (const ruleId of ["RULE-INV-001", "RULE-INV-002", "RULE-WEB-001", "RULE-DSCR-001"] as const) {
      expect(result.findings.find((row) => row.ruleId === ruleId)?.status).toBe("fail");
    }
    expect(result.findings.find((row) => row.ruleId === "RULE-PRICE-001")?.severity).toBe("warn");
    expect(result.findings).toHaveLength(7);
  });
});

describe("reject-first and warn rules", () => {
  it("returns INSUFFICIENT below 80 percent confidence", () => {
    const invoice = { ...sampleInvoices.A, extractionConfidenceBps: 7999, lines: sampleInvoices.A.lines.map((line) => ({ ...line })) };
    const result = decide(inputFor("A", { invoice }));
    expect(result.outcome).toBe("INSUFFICIENT");
    expect(result.winningRuleId).toBe("RULE-DATA-001");
    expect(result.partialAmountMinor).toBeNull();
  });

  it("holds when the safe payment cap is not positive", () => {
    const result = decide(
      inputFor("A", {
        assumptions: {
          ...SPEC_ASSUMPTIONS,
          cashInMinor: 10_000_000n,
        },
      }),
    );
    expect(result.maxPaymentMinor <= 0n).toBe(true);
    expect(result.outcome).toBe("HOLD");
    expect(result.winningRuleId).toBe("RULE-DSCR-001");
    expect(result.partialAmountMinor).toBeNull();
  });

  it("keeps PAY when a unit price only trips the warn rule", () => {
    const result = decide(
      inputFor("A", {
        priceCeilings: [{ descriptionKey: "cartons", ceilingUnitPriceMinor: 10_000n }],
      }),
    );
    expect(result.outcome).toBe("PAY");
    expect(result.winningRuleId).toBe("RULE-PAY-001");
    expect(result.findings.find((row) => row.ruleId === "RULE-PRICE-001")?.status).toBe("fail");
  });
});

describe("hallucination validator", () => {
  const result = decide(inputFor("A"));

  it("accepts citations that exist on the computed result", () => {
    const check = validateExplanation(
      {
        summaryTh: "ข้อเสนอ PAY ตาม RULE-PAY-001 DSCR 1.3255 สูงกว่าเกณฑ์ 1.25",
        summaryEn: "PAY under RULE-PAY-001. total_minor 3745000 and cash 13255000.",
        citedRuleIds: ["RULE-PAY-001", "RULE-DSCR-001"],
        citedAmountsMinor: [3_745_000n, 13_255_000n, 10_000_000n],
      },
      RULE_IDS,
      result.allowedAmounts,
    );
    expect(check.accepted).toBe(true);
  });

  it("rejects unknown rule codes and amounts, including numbers only in prose", () => {
    const check = validateExplanation(
      {
        summaryTh: "อ้าง RULE-FAKE-009 และยอด 999999",
        summaryEn: "See RULE-PAY-001 but pay 999999 extra.",
        citedRuleIds: ["RULE-NOPE-001"],
        citedAmountsMinor: [999n],
      },
      RULE_IDS,
      result.allowedAmounts,
    );
    expect(check.accepted).toBe(false);
    expect(check.reasons.some((reason) => reason.startsWith("cited_rule:"))).toBe(true);
    expect(check.reasons.some((reason) => reason.startsWith("cited_amount:"))).toBe(true);
    expect(check.reasons.some((reason) => reason.includes("RULE-FAKE-009"))).toBe(true);
    expect(check.reasons.some((reason) => reason.includes("999999"))).toBe(true);
  });

  it("falls back to template text that itself passes the validator", () => {
    for (const sample of ["A", "B", "C"] as const) {
      const decided = decide(inputFor(sample));
      const text = templateExplanation(decided, sampleInvoices[sample]);
      const check = validateExplanation(
        { summaryTh: text.th, summaryEn: text.en, citedRuleIds: [decided.winningRuleId], citedAmountsMinor: [] },
        RULE_IDS,
        decided.allowedAmounts,
      );
      expect(check.reasons).toEqual([]);
      expect(check.accepted).toBe(true);
    }
  });
});

describe("strict sample parser", () => {
  it("round-trips the three fictional invoices without calculating", () => {
    for (const sample of ["A", "B", "C"] as const) {
      const parsed = parseStrictInvoice(invoiceToText(sampleInvoices[sample]));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.invoice).toEqual(sampleInvoices[sample]);
    }
  });
});

describe("retrieval query", () => {
  it("sends the legal name and tax id only", () => {
    const invoice = sampleInvoices.A;
    const query = buildRetrievalQuery(invoice.supplierLegalName, invoice.supplierTaxId ?? "");
    expect(query).toBe('"Harbor Supplies Co., Ltd." 0105560000001');
    expect(query.includes(invoice.totalMinor.toString())).toBe(false);
    expect(query.includes("3745000")).toBe(false);
  });
});

describe("deferred FairPay split", () => {
  it("splits an odd total without a remainder", () => {
    expect(splitFiftyFifty(1001n)).toEqual({ kickoffMinor: 500n, finalMinor: 501n });
  });

  it("stores 1.25 as 1250000 micros", () => {
    expect(dscrMicros(12_500_000n, 10_000_000n)).toBe(1_250_000n);
  });
});
