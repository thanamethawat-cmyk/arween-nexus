export const RULE_IDS = [
  "RULE-DATA-001",
  "RULE-INV-001",
  "RULE-INV-002",
  "RULE-WEB-001",
  "RULE-DSCR-001",
  "RULE-PRICE-001",
  "RULE-PAY-001",
] as const;

export type RuleId = (typeof RULE_IDS)[number];
export type Outcome = "PAY" | "PARTIAL" | "HOLD" | "INSUFFICIENT";
export type ScenarioKind = "held" | "paid_full" | "partial_max";
export type Currency = "THB" | "USD";

export type InvoiceLineInput = {
  lineNo: number;
  description: string;
  quantityMillis: bigint;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
};

export type InvoiceInput = {
  supplierLegalName: string;
  supplierTaxId: string | null;
  supplierCountryCode: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  vatRateBps: number;
  subtotalMinor: bigint;
  vatMinor: bigint;
  totalMinor: bigint;
  extractionConfidenceBps: number;
  lines: InvoiceLineInput[];
};

export type AssumptionsInput = {
  cashInMinor: bigint;
  cashOutOperatingMinor: bigint;
  principalDueMinor: bigint;
  interestDueMinor: bigint;
  currency: Currency;
};

export type PriceCeiling = {
  descriptionKey: string;
  ceilingUnitPriceMinor: bigint;
};

export type DecideInput = {
  invoice: InvoiceInput;
  businessCurrency: Currency;
  assumptions: AssumptionsInput | null;
  debtPresent: boolean;
  duplicateInvoice: boolean;
  taxIdFound: boolean;
  priceCeilings: PriceCeiling[];
};

export type Finding = {
  ruleId: RuleId;
  ordinal: number;
  status: "pass" | "fail";
  severity: "block" | "warn" | "info";
  detailKey: string;
  params: Record<string, string>;
};

export type Scenario = {
  kind: ScenarioKind;
  decisionPaymentMinor: bigint;
  cashAvailableMinor: bigint;
  dscrMicros: bigint | null;
  passesDscr: boolean;
};

export type DecisionResult = {
  outcome: Outcome;
  winningRuleId: RuleId;
  partialAmountMinor: bigint | null;
  faultDetermination: "NOT_PERFORMED";
  debtServiceMinor: bigint;
  minAvailableMinor: bigint;
  maxPaymentMinor: bigint;
  scenarios: Scenario[];
  findings: Finding[];
  allowedAmounts: bigint[];
};
