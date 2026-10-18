import {
  cashAvailableMinor,
  CONFIDENCE_MIN_BPS,
  debtServiceMinor,
  DSCR_THRESHOLD_MICROS,
  dscrMicros,
  lineTotalMinor,
  maxPaymentMinor,
  minAvailableMinor,
  passesDscr,
  vatMinor,
} from "./money";
import { RULE_IDS, type DecideInput, type DecisionResult, type Finding, type RuleId, type Scenario } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function finding(
  ruleId: RuleId,
  status: Finding["status"],
  severity: Finding["severity"],
  detailKey: string,
  params: Record<string, string> = {},
): Finding {
  const ordinal = RULE_IDS.indexOf(ruleId) + 1;
  return { ruleId, ordinal, status, severity, detailKey, params };
}

function normalizeKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

function nonNegativeMoney(value: bigint): boolean {
  return value >= 0n;
}

export function decide(input: DecideInput): DecisionResult {
  const invoice = input.invoice;
  const assumptions = input.assumptions;
  const missing: string[] = [];

  if (!invoice.supplierLegalName.trim()) missing.push("supplier_legal_name");
  if (invoice.supplierLegalName.trim().length > 300) missing.push("supplier_legal_name_length");
  if (!invoice.invoiceNumber.trim()) missing.push("invoice_number");
  if (!DATE_RE.test(invoice.issueDate)) missing.push("issue_date");
  if (!DATE_RE.test(invoice.dueDate)) missing.push("due_date");
  if (invoice.currency !== "THB" && invoice.currency !== "USD") missing.push("currency");
  else if (invoice.currency !== input.businessCurrency) missing.push("currency_mismatch");
  if (!Number.isInteger(invoice.vatRateBps) || invoice.vatRateBps < 0 || invoice.vatRateBps > 10000) {
    missing.push("vat_rate_bps");
  }
  if (invoice.lines.length === 0) missing.push("lines");
  if (
    !Number.isInteger(invoice.extractionConfidenceBps) ||
    invoice.extractionConfidenceBps < 0 ||
    invoice.extractionConfidenceBps > 10000
  ) {
    missing.push("extraction_confidence_bps");
  } else if (invoice.extractionConfidenceBps < CONFIDENCE_MIN_BPS) {
    missing.push("confidence_below_80");
  }
  if (!assumptions) missing.push("cashflow_assumption");
  if (!input.debtPresent) missing.push("debt_facility");
  if (assumptions && assumptions.currency !== input.businessCurrency) missing.push("assumption_currency");

  const moneyFields: Array<[string, bigint]> = [
    ["subtotal_minor", invoice.subtotalMinor],
    ["vat_minor", invoice.vatMinor],
    ["total_minor", invoice.totalMinor],
  ];
  for (const [name, value] of moneyFields) {
    if (!nonNegativeMoney(value)) missing.push(name);
  }
  if (assumptions) {
    for (const [name, value] of [
      ["cash_in_minor", assumptions.cashInMinor],
      ["cash_out_operating_minor", assumptions.cashOutOperatingMinor],
      ["principal_due_minor", assumptions.principalDueMinor],
      ["interest_due_minor", assumptions.interestDueMinor],
    ] as const) {
      if (!nonNegativeMoney(value)) missing.push(name);
    }
  }

  const dataFail = missing.length > 0;
  const findings: Finding[] = [
    dataFail
      ? finding("RULE-DATA-001", "fail", "block", "data_missing", { fields: missing.join(",") })
      : finding("RULE-DATA-001", "pass", "block", "data_ok"),
  ];

  findings.push(
    input.duplicateInvoice
      ? finding("RULE-INV-001", "fail", "block", "duplicate", { invoiceNumber: invoice.invoiceNumber })
      : finding("RULE-INV-001", "pass", "block", "not_duplicate", { invoiceNumber: invoice.invoiceNumber }),
  );

  const math = checkInvoiceMath(invoice);
  findings.push(
    math.ok
      ? finding("RULE-INV-002", "pass", "block", "invoice_math_ok")
      : finding("RULE-INV-002", "fail", "block", "invoice_math_bad", { reason: math.reason }),
  );

  const webStatus = input.taxIdStatus ?? (input.taxIdFound ? "found" : "missing");
  findings.push(
    webStatus === "not_verified"
      ? finding("RULE-WEB-001", "fail", "warn", "not_verified", { taxId: invoice.supplierTaxId ?? "" })
      : webStatus === "found"
        ? finding("RULE-WEB-001", "pass", "block", "tax_found", { taxId: invoice.supplierTaxId ?? "" })
        : finding("RULE-WEB-001", "fail", "block", "tax_missing", { taxId: invoice.supplierTaxId ?? "" }),
  );

  const debt = assumptions
    ? debtServiceMinor(assumptions.principalDueMinor, assumptions.interestDueMinor)
    : 0n;
  const minAvailable = minAvailableMinor(debt);
  const maxPay = assumptions
    ? maxPaymentMinor(assumptions.cashInMinor, assumptions.cashOutOperatingMinor, debt)
    : 0n;

  const total = invoice.totalMinor;
  const scenarios = assumptions ? buildScenarios(assumptions.cashInMinor, assumptions.cashOutOperatingMinor, total, maxPay, debt) : [];
  const paidFull = scenarios.find((scenario) => scenario.kind === "paid_full");
  const dscrFails = Boolean(paidFull && paidFull.passesDscr === false && debt > 0n);

  if (!assumptions || !paidFull) {
    findings.push(finding("RULE-DSCR-001", "fail", "block", "dscr_no_forecast"));
  } else if (debt <= 0n) {
    findings.push(finding("RULE-DSCR-001", "pass", "block", "dscr_no_debt"));
  } else if (dscrFails && maxPay > 0n) {
    findings.push(
      finding("RULE-DSCR-001", "fail", "block", "dscr_partial", {
        maxPaymentMinor: maxPay.toString(),
        dscrMicros: (paidFull.dscrMicros ?? 0n).toString(),
      }),
    );
  } else if (dscrFails) {
    findings.push(
      finding("RULE-DSCR-001", "fail", "block", "dscr_hold", {
        maxPaymentMinor: maxPay.toString(),
        dscrMicros: (paidFull.dscrMicros ?? 0n).toString(),
      }),
    );
  } else {
    findings.push(
      finding("RULE-DSCR-001", "pass", "block", "dscr_ok", {
        dscrMicros: (paidFull.dscrMicros ?? 0n).toString(),
      }),
    );
  }

  const ceilings = new Map(input.priceCeilings.map((row) => [normalizeKey(row.descriptionKey), row.ceilingUnitPriceMinor]));
  const breaches = invoice.lines.filter((line) => {
    const ceiling = ceilings.get(normalizeKey(line.description));
    return ceiling !== undefined && line.unitPriceMinor > ceiling;
  });
  findings.push(
    breaches.length
      ? finding("RULE-PRICE-001", "fail", "warn", "price_high", {
          lines: breaches.map((line) => line.description).join(", "),
        })
      : finding("RULE-PRICE-001", "pass", "warn", "price_ok"),
  );

  const blockFailed = findings.some((row) => row.severity === "block" && row.status === "fail");
  findings.push(
    blockFailed
      ? finding("RULE-PAY-001", "fail", "info", "pay_blocked")
      : finding("RULE-PAY-001", "pass", "info", "pay_ok"),
  );

  const winner =
    findings.find((row) => row.severity === "block" && row.status === "fail") ??
    findings.find((row) => row.ruleId === "RULE-PAY-001")!;

  let outcome: DecisionResult["outcome"] = "HOLD";
  if (winner.ruleId === "RULE-DATA-001") outcome = "INSUFFICIENT";
  else if (winner.ruleId === "RULE-DSCR-001") outcome = maxPay > 0n ? "PARTIAL" : "HOLD";
  else if (winner.ruleId === "RULE-PAY-001") outcome = "PAY";
  else outcome = "HOLD";

  const partialAmountMinor = outcome === "PARTIAL" ? maxPay : null;
  const allowed = collectAllowed(input, debt, minAvailable, maxPay, scenarios, partialAmountMinor);

  return {
    outcome,
    winningRuleId: winner.ruleId,
    partialAmountMinor,
    faultDetermination: "NOT_PERFORMED",
    debtServiceMinor: debt,
    minAvailableMinor: minAvailable,
    maxPaymentMinor: maxPay,
    scenarios,
    findings,
    allowedAmounts: allowed,
  };
}

function checkInvoiceMath(invoice: DecideInput["invoice"]): { ok: boolean; reason: string } {
  if (invoice.lines.length === 0) return { ok: false, reason: "no_lines" };
  let sum = 0n;
  for (const line of invoice.lines) {
    if (line.quantityMillis < 0n || line.unitPriceMinor < 0n || line.lineTotalMinor < 0n) {
      return { ok: false, reason: "negative_line" };
    }
    const computed = lineTotalMinor(line.quantityMillis, line.unitPriceMinor);
    if (computed !== line.lineTotalMinor) return { ok: false, reason: "line_total" };
    sum += line.lineTotalMinor;
  }
  if (sum !== invoice.subtotalMinor) return { ok: false, reason: "subtotal" };
  if (!Number.isInteger(invoice.vatRateBps) || invoice.vatRateBps < 0) return { ok: false, reason: "vat_rate" };
  const computedVat = vatMinor(invoice.subtotalMinor, BigInt(invoice.vatRateBps));
  if (computedVat !== invoice.vatMinor) return { ok: false, reason: "vat" };
  if (invoice.subtotalMinor + invoice.vatMinor !== invoice.totalMinor) return { ok: false, reason: "total" };
  return { ok: true, reason: "" };
}

function buildScenarios(
  cashIn: bigint,
  cashOut: bigint,
  total: bigint,
  maxPay: bigint,
  debt: bigint,
): Scenario[] {
  const cap = maxPay > 0n ? maxPay : 0n;
  const partialPay = cap < total ? cap : total;
  const payments: Array<[Scenario["kind"], bigint]> = [
    ["held", 0n],
    ["paid_full", total],
    ["partial_max", partialPay < 0n ? 0n : partialPay],
  ];
  return payments.map(([kind, payment]) => {
    const cash = cashAvailableMinor(cashIn, cashOut, payment);
    return {
      kind,
      decisionPaymentMinor: payment,
      cashAvailableMinor: cash,
      dscrMicros: dscrMicros(cash, debt),
      passesDscr: passesDscr(cash, debt),
    };
  });
}

function collectAllowed(
  input: DecideInput,
  debt: bigint,
  minAvailable: bigint,
  maxPay: bigint,
  scenarios: Scenario[],
  partial: bigint | null,
): bigint[] {
  const values: bigint[] = [
    input.invoice.subtotalMinor,
    input.invoice.vatMinor,
    input.invoice.totalMinor,
    BigInt(input.invoice.vatRateBps),
    BigInt(input.invoice.extractionConfidenceBps),
    BigInt(CONFIDENCE_MIN_BPS),
    DSCR_THRESHOLD_MICROS,
    debt,
    minAvailable,
    maxPay,
    0n,
  ];
  for (const line of input.invoice.lines) {
    values.push(line.quantityMillis, line.unitPriceMinor, line.lineTotalMinor);
  }
  if (input.assumptions) {
    values.push(
      input.assumptions.cashInMinor,
      input.assumptions.cashOutOperatingMinor,
      input.assumptions.principalDueMinor,
      input.assumptions.interestDueMinor,
    );
  }
  for (const scenario of scenarios) {
    values.push(scenario.decisionPaymentMinor, scenario.cashAvailableMinor);
    if (scenario.dscrMicros !== null) values.push(scenario.dscrMicros);
  }
  if (partial !== null) values.push(partial);
  return values;
}
