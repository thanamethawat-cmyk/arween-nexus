export type DecisionView = {
  decisionId: string;
  outcome: "PAY" | "PARTIAL" | "HOLD" | "INSUFFICIENT";
  status: "proposed" | "confirmed" | "rejected";
  winningRuleId: string;
  partialAmountMinor: string | null;
  faultDetermination: "NOT_PERFORMED";
  explanationTh: string;
  explanationEn: string;
  explanationSource: "model" | "template";
  createdAt: string;
  decidedAt: string | null;
  actor: string | null;
  invoice: {
    invoiceId: string;
    invoiceNumber: string;
    supplierLegalName: string;
    supplierTaxId: string | null;
    currency: string;
    issueDate: string;
    dueDate: string;
    vatRateBps: number;
    subtotalMinor: string;
    vatMinor: string;
    totalMinor: string;
    confidenceBps: number;
    gpsVerified: null;
    lines: Array<{
      lineNo: number;
      description: string;
      quantityMillis: string;
      unitPriceMinor: string;
      lineTotalMinor: string;
    }>;
  };
  forecast: {
    debtServiceMinor: string;
    minAvailableMinor: string;
    maxPaymentMinor: string;
  };
  scenarios: Array<{
    kind: "held" | "paid_full" | "partial_max";
    decisionPaymentMinor: string;
    cashAvailableMinor: string;
    dscrMicros: string | null;
    passesDscr: boolean;
  }>;
  findings: Array<{
    ruleId: string;
    ordinal: number;
    status: "pass" | "fail";
    severity: "block" | "warn" | "info";
    detailKey: string;
    params: Record<string, string>;
  }>;
  retrieval: {
    provider: string;
    demoMode: boolean;
    taxIdFound: boolean;
    legalName: string;
    taxId: string | null;
    query: string;
  } | null;
  evidence: Array<{ title: string; url: string; snippet: string | null; containsTaxId: boolean; demo: boolean }>;
  models: Array<{
    purpose: string;
    provider: string;
    modelId: string;
    accepted: boolean;
    latencyMs: number | null;
    error: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
  }>;
};

export type DecisionListItem = {
  decisionId: string;
  outcome: DecisionView["outcome"];
  status: DecisionView["status"];
  winningRuleId: string;
  invoiceNumber: string;
  supplierLegalName: string;
  totalMinor: string;
  currency: string;
  createdAt: string;
  actor: string | null;
};

export type BootstrapView = {
  businessName: string;
  baseCurrency: "THB" | "USD";
  demo: { nebius: boolean; tavily: boolean };
  models: { extract: string; explain: string; vision: string; baseUrl: string };
  assumptions: {
    cashInMinor: string;
    cashOutOperatingMinor: string;
    principalDueMinor: string;
    interestDueMinor: string;
  };
  ceilings: Array<{ descriptionKey: string; ceilingUnitPriceMinor: string }>;
  gps: "deferred";
};
