import { Pool, type PoolClient } from "pg";
import { appConfig, demoFlags } from "./env";
import { id } from "./ids";
import type { DecisionResult, InvoiceInput } from "./engine/types";
import { VANTA_TAX_ID } from "./samples";
import type { EvidenceHit } from "./tavily/fixtures";
import type { BootstrapView, DecisionListItem, DecisionView } from "./view";

const globalForPg = globalThis as unknown as { arweenPool?: Pool };

function getPool(): Pool {
  if (!globalForPg.arweenPool) {
    globalForPg.arweenPool = new Pool({ connectionString: appConfig().databaseUrl });
  }
  return globalForPg.arweenPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rules (
  ordinal integer PRIMARY KEY,
  rule_id text UNIQUE NOT NULL,
  severity text NOT NULL,
  summary text NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  business_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(tenant_id),
  name text NOT NULL,
  base_currency text NOT NULL CHECK (base_currency IN ('THB', 'USD')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counterparties (
  counterparty_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  legal_name text NOT NULL CHECK (char_length(legal_name) BETWEEN 1 AND 300),
  tax_id text,
  country_code text,
  role text NOT NULL DEFAULT 'supplier',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS counterparties_tax_role
  ON counterparties (business_id, tax_id, role)
  WHERE tax_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS debt_facilities (
  debt_facility_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  principal_due_minor bigint NOT NULL CHECK (principal_due_minor >= 0),
  interest_due_minor bigint NOT NULL CHECK (interest_due_minor >= 0),
  currency text NOT NULL CHECK (currency IN ('THB', 'USD')),
  status text NOT NULL CHECK (status IN ('current', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS debt_one_current
  ON debt_facilities (business_id) WHERE status = 'current';

CREATE TABLE IF NOT EXISTS cashflow_assumptions (
  assumption_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  cash_in_minor bigint NOT NULL CHECK (cash_in_minor >= 0),
  cash_out_operating_minor bigint NOT NULL CHECK (cash_out_operating_minor >= 0),
  currency text NOT NULL CHECK (currency IN ('THB', 'USD')),
  status text NOT NULL CHECK (status IN ('current', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assumption_one_current
  ON cashflow_assumptions (business_id) WHERE status = 'current';

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  counterparty_id text NOT NULL REFERENCES counterparties(counterparty_id),
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('THB', 'USD')),
  vat_rate_bps integer NOT NULL CHECK (vat_rate_bps >= 0 AND vat_rate_bps <= 10000),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  vat_minor bigint NOT NULL CHECK (vat_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  evidence_confidence_bps integer NOT NULL CHECK (evidence_confidence_bps >= 0 AND evidence_confidence_bps <= 10000),
  gps_verified boolean,
  anchor boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('issued', 'void')),
  source_filename text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  line_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id),
  line_no integer NOT NULL,
  description text NOT NULL,
  quantity_millis bigint NOT NULL,
  unit_price_minor bigint NOT NULL,
  line_total_minor bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS price_references (
  reference_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  description_key text NOT NULL,
  ceiling_unit_price_minor bigint NOT NULL CHECK (ceiling_unit_price_minor >= 0),
  UNIQUE (business_id, description_key)
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  forecast_run_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  invoice_id text NOT NULL REFERENCES invoices(invoice_id),
  debt_facility_id text NOT NULL,
  assumption_id text NOT NULL,
  debt_service_minor bigint NOT NULL,
  min_available_minor bigint NOT NULL,
  max_payment_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_scenarios (
  scenario_id text PRIMARY KEY,
  forecast_run_id text NOT NULL REFERENCES forecast_runs(forecast_run_id),
  kind text NOT NULL CHECK (kind IN ('held', 'paid_full', 'partial_max')),
  decision_payment_minor bigint NOT NULL,
  cash_available_minor bigint NOT NULL,
  dscr_micros bigint,
  passes_dscr boolean NOT NULL,
  UNIQUE (forecast_run_id, kind)
);

CREATE TABLE IF NOT EXISTS payment_decisions (
  decision_id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(business_id),
  invoice_id text NOT NULL REFERENCES invoices(invoice_id),
  forecast_run_id text NOT NULL REFERENCES forecast_runs(forecast_run_id),
  idempotency_key text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PAY', 'PARTIAL', 'HOLD', 'INSUFFICIENT')),
  winning_rule_id text NOT NULL REFERENCES rules(rule_id),
  partial_amount_minor bigint,
  status text NOT NULL CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  fault_determination text NOT NULL DEFAULT 'NOT_PERFORMED' CHECK (fault_determination = 'NOT_PERFORMED'),
  explanation_th text NOT NULL,
  explanation_en text NOT NULL,
  explanation_source text NOT NULL CHECK (explanation_source IN ('model', 'template')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  actor text,
  UNIQUE (business_id, idempotency_key),
  CHECK (
    (outcome = 'PARTIAL' AND partial_amount_minor IS NOT NULL)
    OR (outcome <> 'PARTIAL' AND partial_amount_minor IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS rule_findings (
  finding_id text PRIMARY KEY,
  decision_id text NOT NULL REFERENCES payment_decisions(decision_id),
  rule_id text NOT NULL REFERENCES rules(rule_id),
  ordinal integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  severity text NOT NULL CHECK (severity IN ('block', 'warn', 'info')),
  detail_key text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS retrieval_queries (
  retrieval_id text PRIMARY KEY,
  decision_id text NOT NULL REFERENCES payment_decisions(decision_id),
  provider text NOT NULL,
  legal_name text NOT NULL,
  tax_id text,
  query_text text NOT NULL,
  tax_id_found boolean NOT NULL,
  demo_mode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id text PRIMARY KEY,
  retrieval_id text NOT NULL REFERENCES retrieval_queries(retrieval_id),
  title text NOT NULL,
  url text NOT NULL,
  snippet text,
  contains_tax_id boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS model_invocations (
  invocation_id text PRIMARY KEY,
  decision_id text,
  purpose text NOT NULL CHECK (purpose IN ('extract', 'explain', 'transcribe')),
  provider text NOT NULL,
  model_id text NOT NULL,
  accepted boolean NOT NULL,
  latency_ms integer,
  error text,
  response_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id text PRIMARY KEY,
  decision_id text,
  action text NOT NULL,
  actor text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const RULE_ROWS: Array<[number, string, string, string]> = [
  [1, "RULE-DATA-001", "block", "Required fields, currency match, and extraction confidence at least 80 percent"],
  [2, "RULE-INV-001", "block", "Duplicate non-void invoice number for the same counterparty"],
  [3, "RULE-INV-002", "block", "Line totals, VAT, or grand total disagree with integer formulas"],
  [4, "RULE-WEB-001", "block", "Public search did not contain the counterparty tax id"],
  [5, "RULE-DSCR-001", "block", "Full payment misses DSCR 1.25; partial only when the safe cap is positive"],
  [6, "RULE-PRICE-001", "warn", "Unit price above the reference ceiling; does not change the outcome"],
  [7, "RULE-PAY-001", "info", "No blocking rule failed, so the proposal is pay in full"],
];

let ready: Promise<void> | null = null;

export async function pingDb(): Promise<void> {
  await ensureDb();
  await getPool().query("SELECT 1");
}

export function ensureDb(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function migrate(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of SCHEMA.split(/;\s*(?:\n|$)/).map((part) => part.trim()).filter(Boolean)) {
      await client.query(statement);
    }
    await client.query("ALTER TABLE model_invocations ADD COLUMN IF NOT EXISTS prompt_tokens integer");
    await client.query("ALTER TABLE model_invocations ADD COLUMN IF NOT EXISTS completion_tokens integer");
    for (const [ordinal, ruleId, severity, summary] of RULE_ROWS) {
      await client.query(
        `INSERT INTO rules (ordinal, rule_id, severity, summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (rule_id) DO NOTHING`,
        [ordinal, ruleId, severity, summary],
      );
    }
    const existing = await client.query("SELECT business_id FROM businesses LIMIT 1");
    if (existing.rowCount === 0) {
      const tenantId = id("tnt_");
      const businessId = id("biz_");
      const debtId = id("dbt_");
      const assumptionId = id("asm_");
      const counterpartyId = id("cpy_");
      const invoiceId = id("inv_");
      const lineId = id("ln_");
      await client.query("INSERT INTO tenants (tenant_id, name) VALUES ($1, $2)", [tenantId, "ARWEEN Demo"]);
      await client.query(
        "INSERT INTO businesses (business_id, tenant_id, name, base_currency) VALUES ($1, $2, $3, 'THB')",
        [businessId, tenantId, "Baan Suan Studio"],
      );
      await client.query(
        `INSERT INTO debt_facilities
          (debt_facility_id, business_id, principal_due_minor, interest_due_minor, currency, status)
         VALUES ($1, $2, 8000000, 2000000, 'THB', 'current')`,
        [debtId, businessId],
      );
      await client.query(
        `INSERT INTO cashflow_assumptions
          (assumption_id, business_id, cash_in_minor, cash_out_operating_minor, currency, status)
         VALUES ($1, $2, 25000000, 8000000, 'THB', 'current')`,
        [assumptionId, businessId],
      );
      await client.query(
        `INSERT INTO price_references (reference_id, business_id, description_key, ceiling_unit_price_minor)
         VALUES ($1, $2, 'cartons', 30000)`,
        [id("ref_"), businessId],
      );
      await client.query(
        `INSERT INTO counterparties (counterparty_id, business_id, legal_name, tax_id, country_code, role)
         VALUES ($1, $2, 'Vanta Commerce Co., Ltd.', $3, 'TH', 'supplier')`,
        [counterpartyId, businessId, VANTA_TAX_ID],
      );
      await client.query(
        `INSERT INTO invoices (
           invoice_id, business_id, counterparty_id, invoice_number, issue_date, due_date, currency,
           vat_rate_bps, subtotal_minor, vat_minor, total_minor, evidence_confidence_bps,
           gps_verified, anchor, status, source_filename
         ) VALUES (
           $1, $2, $3, 'INV-9001', '2026-09-01', '2026-09-15', 'THB',
           700, 1000000, 70000, 1070000, 9600,
           NULL, true, 'issued', 'seed-anchor.txt'
         )`,
        [invoiceId, businessId, counterpartyId],
      );
      await client.query(
        `INSERT INTO invoice_lines (line_id, invoice_id, line_no, description, quantity_millis, unit_price_minor, line_total_minor)
         VALUES ($1, $2, 1, 'Prior retainer', 1000, 1000000, 1000000)`,
        [lineId, invoiceId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type BusinessContext = {
  businessId: string;
  businessName: string;
  baseCurrency: "THB" | "USD";
  assumptionId: string;
  debtFacilityId: string;
  cashInMinor: bigint;
  cashOutOperatingMinor: bigint;
  principalDueMinor: bigint;
  interestDueMinor: bigint;
  ceilings: Array<{ descriptionKey: string; ceilingUnitPriceMinor: bigint }>;
};

export async function loadContext(): Promise<BusinessContext> {
  await ensureDb();
  const pool = getPool();
  const business = await pool.query<{
    business_id: string;
    name: string;
    base_currency: "THB" | "USD";
  }>("SELECT business_id, name, base_currency FROM businesses ORDER BY created_at LIMIT 1");
  const row = business.rows[0];
  if (!row) throw new Error("business_missing");
  const assumption = await pool.query<{
    assumption_id: string;
    cash_in_minor: string;
    cash_out_operating_minor: string;
  }>(
    `SELECT assumption_id, cash_in_minor::text, cash_out_operating_minor::text
     FROM cashflow_assumptions WHERE business_id = $1 AND status = 'current'`,
    [row.business_id],
  );
  const debt = await pool.query<{
    debt_facility_id: string;
    principal_due_minor: string;
    interest_due_minor: string;
  }>(
    `SELECT debt_facility_id, principal_due_minor::text, interest_due_minor::text
     FROM debt_facilities WHERE business_id = $1 AND status = 'current'`,
    [row.business_id],
  );
  const prices = await pool.query<{ description_key: string; ceiling_unit_price_minor: string }>(
    `SELECT description_key, ceiling_unit_price_minor::text FROM price_references WHERE business_id = $1`,
    [row.business_id],
  );
  const assumptionRow = assumption.rows[0];
  const debtRow = debt.rows[0];
  if (!assumptionRow || !debtRow) throw new Error("forecast_inputs_missing");
  return {
    businessId: row.business_id,
    businessName: row.name,
    baseCurrency: row.base_currency,
    assumptionId: assumptionRow.assumption_id,
    debtFacilityId: debtRow.debt_facility_id,
    cashInMinor: BigInt(assumptionRow.cash_in_minor),
    cashOutOperatingMinor: BigInt(assumptionRow.cash_out_operating_minor),
    principalDueMinor: BigInt(debtRow.principal_due_minor),
    interestDueMinor: BigInt(debtRow.interest_due_minor),
    ceilings: prices.rows.map((price) => ({
      descriptionKey: price.description_key,
      ceilingUnitPriceMinor: BigInt(price.ceiling_unit_price_minor),
    })),
  };
}

export async function findCounterpartyId(businessId: string, taxId: string | null, legalName: string): Promise<string | null> {
  const pool = getPool();
  if (taxId) {
    const found = await pool.query<{ counterparty_id: string }>(
      `SELECT counterparty_id FROM counterparties
       WHERE business_id = $1 AND tax_id = $2 AND role = 'supplier'`,
      [businessId, taxId],
    );
    if (found.rows[0]) return found.rows[0].counterparty_id;
  }
  const byName = await pool.query<{ counterparty_id: string }>(
    `SELECT counterparty_id FROM counterparties
     WHERE business_id = $1 AND lower(legal_name) = lower($2) AND role = 'supplier'
     ORDER BY created_at LIMIT 1`,
    [businessId, legalName],
  );
  return byName.rows[0]?.counterparty_id ?? null;
}

export async function hasActiveDuplicate(businessId: string, counterpartyId: string, invoiceNumber: string): Promise<boolean> {
  const pool = getPool();
  const found = await pool.query(
    `SELECT 1 FROM invoices
     WHERE business_id = $1 AND counterparty_id = $2 AND invoice_number = $3 AND status <> 'void'
     LIMIT 1`,
    [businessId, counterpartyId, invoiceNumber],
  );
  return (found.rowCount ?? 0) > 0;
}

export async function voidReplayInvoices(businessId: string, taxId: string, invoiceNumber: string): Promise<void> {
  await ensureDb();
  const pool = getPool();
  await pool.query(
    `UPDATE invoices SET status = 'void'
     WHERE business_id = $1
       AND invoice_number = $2
       AND anchor = false
       AND status <> 'void'
       AND counterparty_id IN (
         SELECT counterparty_id FROM counterparties WHERE business_id = $1 AND tax_id = $3
       )`,
    [businessId, invoiceNumber, taxId],
  );
}

export type InvocationDraft = {
  purpose: "extract" | "explain" | "transcribe";
  provider: string;
  modelId: string;
  accepted: boolean;
  latencyMs: number | null;
  error: string | null;
  responseExcerpt: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type AnalysisWrite = {
  idempotencyKey: string;
  actor: string;
  context: BusinessContext;
  invoice: InvoiceInput;
  filename: string;
  duplicateAtDecision: boolean;
  result: DecisionResult;
  explanationTh: string;
  explanationEn: string;
  explanationSource: "model" | "template";
  retrieval: {
    provider: string;
    demoMode: boolean;
    query: string;
    taxIdFound: boolean;
    evidence: EvidenceHit[];
  };
  invocations: InvocationDraft[];
};

export async function persistAnalysis(write: AnalysisWrite): Promise<{ decisionId: string; replayed: boolean }> {
  await ensureDb();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [write.idempotencyKey]);
    const existing = await client.query<{ decision_id: string }>(
      `SELECT decision_id FROM payment_decisions WHERE business_id = $1 AND idempotency_key = $2`,
      [write.context.businessId, write.idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { decisionId: existing.rows[0].decision_id, replayed: true };
    }

    const counterpartyId = await upsertCounterparty(client, write.context.businessId, write.invoice);
    const duplicateNow = await duplicateOn(client, write.context.businessId, counterpartyId, write.invoice.invoiceNumber);
    let result = write.result;
    let explanationTh = write.explanationTh;
    let explanationEn = write.explanationEn;
    let explanationSource = write.explanationSource;
    if (duplicateNow !== write.duplicateAtDecision) {
      const { decide } = await import("./engine/decide");
      const { templateExplanation } = await import("./engine/templates");
      result = decide({
        invoice: write.invoice,
        businessCurrency: write.context.baseCurrency,
        assumptions: {
          cashInMinor: write.context.cashInMinor,
          cashOutOperatingMinor: write.context.cashOutOperatingMinor,
          principalDueMinor: write.context.principalDueMinor,
          interestDueMinor: write.context.interestDueMinor,
          currency: write.context.baseCurrency,
        },
        debtPresent: true,
        duplicateInvoice: duplicateNow,
        taxIdFound: write.retrieval.taxIdFound,
        priceCeilings: write.context.ceilings,
      });
      const template = templateExplanation(result, write.invoice);
      explanationTh = template.th;
      explanationEn = template.en;
      explanationSource = "template";
    }

    const invoiceId = id("inv_");
    const forecastId = id("frc_");
    const decisionId = id("dec_");
    const retrievalId = id("ret_");

    await client.query(
      `INSERT INTO invoices (
         invoice_id, business_id, counterparty_id, invoice_number, issue_date, due_date, currency,
         vat_rate_bps, subtotal_minor, vat_minor, total_minor, evidence_confidence_bps,
         gps_verified, anchor, status, source_filename
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,false,'issued',$13)`,
      [
        invoiceId,
        write.context.businessId,
        counterpartyId,
        write.invoice.invoiceNumber,
        write.invoice.issueDate,
        write.invoice.dueDate,
        write.invoice.currency,
        write.invoice.vatRateBps,
        write.invoice.subtotalMinor.toString(),
        write.invoice.vatMinor.toString(),
        write.invoice.totalMinor.toString(),
        write.invoice.extractionConfidenceBps,
        write.filename,
      ],
    );
    for (const line of write.invoice.lines) {
      await client.query(
        `INSERT INTO invoice_lines (line_id, invoice_id, line_no, description, quantity_millis, unit_price_minor, line_total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id("ln_"),
          invoiceId,
          line.lineNo,
          line.description,
          line.quantityMillis.toString(),
          line.unitPriceMinor.toString(),
          line.lineTotalMinor.toString(),
        ],
      );
    }
    await client.query(
      `INSERT INTO forecast_runs (
         forecast_run_id, business_id, invoice_id, debt_facility_id, assumption_id,
         debt_service_minor, min_available_minor, max_payment_minor
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        forecastId,
        write.context.businessId,
        invoiceId,
        write.context.debtFacilityId,
        write.context.assumptionId,
        result.debtServiceMinor.toString(),
        result.minAvailableMinor.toString(),
        result.maxPaymentMinor.toString(),
      ],
    );
    for (const scenario of result.scenarios) {
      await client.query(
        `INSERT INTO forecast_scenarios (
           scenario_id, forecast_run_id, kind, decision_payment_minor, cash_available_minor, dscr_micros, passes_dscr
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id("scn_"),
          forecastId,
          scenario.kind,
          scenario.decisionPaymentMinor.toString(),
          scenario.cashAvailableMinor.toString(),
          scenario.dscrMicros === null ? null : scenario.dscrMicros.toString(),
          scenario.passesDscr,
        ],
      );
    }
    await client.query(
      `INSERT INTO payment_decisions (
         decision_id, business_id, invoice_id, forecast_run_id, idempotency_key, outcome, winning_rule_id,
         partial_amount_minor, status, explanation_th, explanation_en, explanation_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'proposed',$9,$10,$11)`,
      [
        decisionId,
        write.context.businessId,
        invoiceId,
        forecastId,
        write.idempotencyKey,
        result.outcome,
        result.winningRuleId,
        result.partialAmountMinor === null ? null : result.partialAmountMinor.toString(),
        explanationTh,
        explanationEn,
        explanationSource,
      ],
    );
    for (const finding of result.findings) {
      await client.query(
        `INSERT INTO rule_findings (finding_id, decision_id, rule_id, ordinal, status, severity, detail_key, params)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          id("fnd_"),
          decisionId,
          finding.ruleId,
          finding.ordinal,
          finding.status,
          finding.severity,
          finding.detailKey,
          JSON.stringify(finding.params),
        ],
      );
    }
    await client.query(
      `INSERT INTO retrieval_queries (
         retrieval_id, decision_id, provider, legal_name, tax_id, query_text, tax_id_found, demo_mode
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        retrievalId,
        decisionId,
        write.retrieval.provider,
        write.invoice.supplierLegalName,
        write.invoice.supplierTaxId,
        write.retrieval.query,
        write.retrieval.taxIdFound,
        write.retrieval.demoMode,
      ],
    );
    for (const hit of write.retrieval.evidence) {
      await client.query(
        `INSERT INTO evidence (evidence_id, retrieval_id, title, url, snippet, contains_tax_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id("evd_"), retrievalId, hit.title, hit.url, hit.snippet, hit.containsTaxId],
      );
    }
    for (const invocation of write.invocations) {
      await client.query(
        `INSERT INTO model_invocations (
           invocation_id, decision_id, purpose, provider, model_id, accepted, latency_ms, error, response_excerpt,
           prompt_tokens, completion_tokens
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id("mdl_"),
          decisionId,
          invocation.purpose,
          invocation.provider,
          invocation.modelId,
          invocation.accepted,
          invocation.latencyMs,
          invocation.error,
          invocation.responseExcerpt,
          invocation.promptTokens,
          invocation.completionTokens,
        ],
      );
    }
    await client.query(
      `INSERT INTO audit_events (audit_id, decision_id, action, actor, detail)
       VALUES ($1,$2,'decision.proposed',$3,$4)`,
      [id("aud_"), decisionId, write.actor, `${result.outcome} via ${result.winningRuleId}`],
    );
    await client.query("COMMIT");
    return { decisionId, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertCounterparty(client: PoolClient, businessId: string, invoice: InvoiceInput): Promise<string> {
  if (invoice.supplierTaxId) {
    const found = await client.query<{ counterparty_id: string }>(
      `SELECT counterparty_id FROM counterparties
       WHERE business_id = $1 AND tax_id = $2 AND role = 'supplier'`,
      [businessId, invoice.supplierTaxId],
    );
    if (found.rows[0]) return found.rows[0].counterparty_id;
  }
  const byName = await client.query<{ counterparty_id: string }>(
    `SELECT counterparty_id FROM counterparties
     WHERE business_id = $1 AND lower(legal_name) = lower($2) AND role = 'supplier'
     ORDER BY created_at LIMIT 1`,
    [businessId, invoice.supplierLegalName],
  );
  if (byName.rows[0]) return byName.rows[0].counterparty_id;
  const counterpartyId = id("cpy_");
  await client.query(
    `INSERT INTO counterparties (counterparty_id, business_id, legal_name, tax_id, country_code, role)
     VALUES ($1,$2,$3,$4,$5,'supplier')`,
    [counterpartyId, businessId, invoice.supplierLegalName.trim(), invoice.supplierTaxId, invoice.supplierCountryCode || null],
  );
  return counterpartyId;
}

async function duplicateOn(client: PoolClient, businessId: string, counterpartyId: string, invoiceNumber: string): Promise<boolean> {
  const found = await client.query(
    `SELECT 1 FROM invoices
     WHERE business_id = $1 AND counterparty_id = $2 AND invoice_number = $3 AND status <> 'void' LIMIT 1`,
    [businessId, counterpartyId, invoiceNumber],
  );
  return (found.rowCount ?? 0) > 0;
}

export async function findDecisionIdByIdempotency(idempotencyKey: string): Promise<string | null> {
  await ensureDb();
  const pool = getPool();
  const found = await pool.query<{ decision_id: string }>(
    `SELECT decision_id FROM payment_decisions WHERE idempotency_key = $1 ORDER BY created_at DESC LIMIT 1`,
    [idempotencyKey],
  );
  return found.rows[0]?.decision_id ?? null;
}

export async function getDecision(decisionId: string): Promise<DecisionView | null> {
  await ensureDb();
  const pool = getPool();
  const head = await pool.query<{
    decision_id: string;
    outcome: DecisionView["outcome"];
    status: DecisionView["status"];
    winning_rule_id: string;
    partial_amount_minor: string | null;
    fault_determination: "NOT_PERFORMED";
    explanation_th: string;
    explanation_en: string;
    explanation_source: "model" | "template";
    created_at: Date;
    decided_at: Date | null;
    actor: string | null;
    invoice_id: string;
    invoice_number: string;
    currency: string;
    issue_date: string;
    due_date: string;
    vat_rate_bps: number;
    subtotal_minor: string;
    vat_minor: string;
    total_minor: string;
    evidence_confidence_bps: number;
    legal_name: string;
    tax_id: string | null;
    debt_service_minor: string;
    min_available_minor: string;
    max_payment_minor: string;
  }>(
    `SELECT d.decision_id, d.outcome, d.status, d.winning_rule_id, d.partial_amount_minor::text,
            d.fault_determination, d.explanation_th, d.explanation_en, d.explanation_source,
            d.created_at, d.decided_at, d.actor,
            i.invoice_id, i.invoice_number, i.currency, i.issue_date::text, i.due_date::text,
            i.vat_rate_bps, i.subtotal_minor::text, i.vat_minor::text, i.total_minor::text,
            i.evidence_confidence_bps, c.legal_name, c.tax_id,
            f.debt_service_minor::text, f.min_available_minor::text, f.max_payment_minor::text
     FROM payment_decisions d
     JOIN invoices i ON i.invoice_id = d.invoice_id
     JOIN counterparties c ON c.counterparty_id = i.counterparty_id
     JOIN forecast_runs f ON f.forecast_run_id = d.forecast_run_id
     WHERE d.decision_id = $1`,
    [decisionId],
  );
  const row = head.rows[0];
  if (!row) return null;
  const [lines, scenarios, findings, retrieval, models] = await Promise.all([
    pool.query<{
      line_no: number;
      description: string;
      quantity_millis: string;
      unit_price_minor: string;
      line_total_minor: string;
    }>(
      `SELECT line_no, description, quantity_millis::text, unit_price_minor::text, line_total_minor::text
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_no`,
      [row.invoice_id],
    ),
    pool.query<{
      kind: "held" | "paid_full" | "partial_max";
      decision_payment_minor: string;
      cash_available_minor: string;
      dscr_micros: string | null;
      passes_dscr: boolean;
    }>(
      `SELECT s.kind, s.decision_payment_minor::text, s.cash_available_minor::text, s.dscr_micros::text, s.passes_dscr
       FROM forecast_scenarios s
       JOIN payment_decisions d ON d.forecast_run_id = s.forecast_run_id
       WHERE d.decision_id = $1
       ORDER BY CASE s.kind WHEN 'held' THEN 1 WHEN 'paid_full' THEN 2 ELSE 3 END`,
      [decisionId],
    ),
    pool.query<{
      rule_id: string;
      ordinal: number;
      status: "pass" | "fail";
      severity: "block" | "warn" | "info";
      detail_key: string;
      params: Record<string, string>;
    }>(
      `SELECT rule_id, ordinal, status, severity, detail_key, params
       FROM rule_findings WHERE decision_id = $1 ORDER BY ordinal`,
      [decisionId],
    ),
    pool.query<{
      retrieval_id: string;
      provider: string;
      demo_mode: boolean;
      tax_id_found: boolean;
      legal_name: string;
      tax_id: string | null;
      query_text: string;
    }>(
      `SELECT retrieval_id, provider, demo_mode, tax_id_found, legal_name, tax_id, query_text
       FROM retrieval_queries WHERE decision_id = $1`,
      [decisionId],
    ),
    pool.query<{
      purpose: string;
      provider: string;
      model_id: string;
      accepted: boolean;
      latency_ms: number | null;
      error: string | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
    }>(
      `SELECT purpose, provider, model_id, accepted, latency_ms, error, prompt_tokens, completion_tokens
       FROM model_invocations WHERE decision_id = $1 ORDER BY created_at`,
      [decisionId],
    ),
  ]);
  const retrievalRow = retrieval.rows[0];
  let evidence: DecisionView["evidence"] = [];
  if (retrievalRow) {
    const hits = await pool.query<{ title: string; url: string; snippet: string | null; contains_tax_id: boolean }>(
      `SELECT title, url, snippet, contains_tax_id FROM evidence WHERE retrieval_id = $1`,
      [retrievalRow.retrieval_id],
    );
    evidence = hits.rows.map((hit) => ({
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      containsTaxId: hit.contains_tax_id,
      demo: retrievalRow.demo_mode,
    }));
  }
  return {
    decisionId: row.decision_id,
    outcome: row.outcome,
    status: row.status,
    winningRuleId: row.winning_rule_id,
    partialAmountMinor: row.partial_amount_minor,
    faultDetermination: "NOT_PERFORMED",
    explanationTh: row.explanation_th,
    explanationEn: row.explanation_en,
    explanationSource: row.explanation_source,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    actor: row.actor,
    invoice: {
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      supplierLegalName: row.legal_name,
      supplierTaxId: row.tax_id,
      currency: row.currency,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      vatRateBps: row.vat_rate_bps,
      subtotalMinor: row.subtotal_minor,
      vatMinor: row.vat_minor,
      totalMinor: row.total_minor,
      confidenceBps: row.evidence_confidence_bps,
      gpsVerified: null,
      lines: lines.rows.map((line) => ({
        lineNo: line.line_no,
        description: line.description,
        quantityMillis: line.quantity_millis,
        unitPriceMinor: line.unit_price_minor,
        lineTotalMinor: line.line_total_minor,
      })),
    },
    forecast: {
      debtServiceMinor: row.debt_service_minor,
      minAvailableMinor: row.min_available_minor,
      maxPaymentMinor: row.max_payment_minor,
    },
    scenarios: scenarios.rows.map((scenario) => ({
      kind: scenario.kind,
      decisionPaymentMinor: scenario.decision_payment_minor,
      cashAvailableMinor: scenario.cash_available_minor,
      dscrMicros: scenario.dscr_micros,
      passesDscr: scenario.passes_dscr,
    })),
    findings: findings.rows.map((finding) => ({
      ruleId: finding.rule_id,
      ordinal: finding.ordinal,
      status: finding.status,
      severity: finding.severity,
      detailKey: finding.detail_key,
      params: finding.params ?? {},
    })),
    retrieval: retrievalRow
      ? {
          provider: retrievalRow.provider,
          demoMode: retrievalRow.demo_mode,
          taxIdFound: retrievalRow.tax_id_found,
          legalName: retrievalRow.legal_name,
          taxId: retrievalRow.tax_id,
          query: retrievalRow.query_text,
        }
      : null,
    evidence,
    models: models.rows.map((model) => ({
      purpose: model.purpose,
      provider: model.provider,
      modelId: model.model_id,
      accepted: model.accepted,
      latencyMs: model.latency_ms,
      error: model.error,
      promptTokens: model.prompt_tokens,
      completionTokens: model.completion_tokens,
    })),
  };
}

export async function listDecisions(): Promise<DecisionListItem[]> {
  await ensureDb();
  const pool = getPool();
  const rows = await pool.query<{
    decision_id: string;
    outcome: DecisionListItem["outcome"];
    status: DecisionListItem["status"];
    winning_rule_id: string;
    invoice_number: string;
    legal_name: string;
    total_minor: string;
    currency: string;
    created_at: Date;
  }>(
    `SELECT d.decision_id, d.outcome, d.status, d.winning_rule_id, i.invoice_number, c.legal_name,
            i.total_minor::text, i.currency, d.created_at
     FROM payment_decisions d
     JOIN invoices i ON i.invoice_id = d.invoice_id
     JOIN counterparties c ON c.counterparty_id = i.counterparty_id
     ORDER BY d.created_at DESC
     LIMIT 50`,
  );
  return rows.rows.map((row) => ({
    decisionId: row.decision_id,
    outcome: row.outcome,
    status: row.status,
    winningRuleId: row.winning_rule_id,
    invoiceNumber: row.invoice_number,
    supplierLegalName: row.legal_name,
    totalMinor: row.total_minor,
    currency: row.currency,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function setDecisionStatus(
  decisionId: string,
  status: "confirmed" | "rejected",
  actor: string,
): Promise<DecisionView | null> {
  await ensureDb();
  const pool = getPool();
  const updated = await pool.query(
    `UPDATE payment_decisions
     SET status = $2, decided_at = now(), actor = $3
     WHERE decision_id = $1 AND status = 'proposed'
     RETURNING decision_id`,
    [decisionId, status, actor],
  );
  if ((updated.rowCount ?? 0) === 0) {
    const current = await pool.query("SELECT status FROM payment_decisions WHERE decision_id = $1", [decisionId]);
    if ((current.rowCount ?? 0) === 0) return null;
    return getDecision(decisionId);
  }
  await pool.query(
    `INSERT INTO audit_events (audit_id, decision_id, action, actor, detail) VALUES ($1,$2,$3,$4,$5)`,
    [id("aud_"), decisionId, status === "confirmed" ? "decision.confirmed" : "decision.rejected", actor, "No funds moved"],
  );
  return getDecision(decisionId);
}

export async function listAudit(): Promise<
  Array<{ auditId: string; decisionId: string | null; action: string; actor: string; detail: string; createdAt: string }>
> {
  await ensureDb();
  const pool = getPool();
  const rows = await pool.query<{
    audit_id: string;
    decision_id: string | null;
    action: string;
    actor: string;
    detail: string;
    created_at: Date;
  }>(`SELECT audit_id, decision_id, action, actor, detail, created_at FROM audit_events ORDER BY created_at DESC LIMIT 100`);
  return rows.rows.map((row) => ({
    auditId: row.audit_id,
    decisionId: row.decision_id,
    action: row.action,
    actor: row.actor,
    detail: row.detail,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function recordInvocations(invocations: InvocationDraft[]): Promise<void> {
  if (invocations.length === 0) return;
  await ensureDb();
  const pool = getPool();
  for (const invocation of invocations) {
    await pool.query(
      `INSERT INTO model_invocations (
         invocation_id, decision_id, purpose, provider, model_id, accepted, latency_ms, error, response_excerpt,
         prompt_tokens, completion_tokens
       ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id("mdl_"),
        invocation.purpose,
        invocation.provider,
        invocation.modelId,
        invocation.accepted,
        invocation.latencyMs,
        invocation.error,
        invocation.responseExcerpt,
        invocation.promptTokens,
        invocation.completionTokens,
      ],
    );
  }
}

export async function recordAudit(action: string, actor: string, detail: string, decisionId?: string): Promise<void> {
  await ensureDb();
  const pool = getPool();
  await pool.query(
    `INSERT INTO audit_events (audit_id, decision_id, action, actor, detail) VALUES ($1,$2,$3,$4,$5)`,
    [id("aud_"), decisionId ?? null, action, actor, detail],
  );
}

export async function updateAssumptions(input: {
  cashInMinor: bigint;
  cashOutOperatingMinor: bigint;
  principalDueMinor: bigint;
  interestDueMinor: bigint;
  actor: string;
}): Promise<void> {
  const context = await loadContext();
  const pool = getPool();
  await pool.query(
    `UPDATE cashflow_assumptions
     SET cash_in_minor = $2, cash_out_operating_minor = $3
     WHERE assumption_id = $1`,
    [context.assumptionId, input.cashInMinor.toString(), input.cashOutOperatingMinor.toString()],
  );
  await pool.query(
    `UPDATE debt_facilities SET principal_due_minor = $2, interest_due_minor = $3 WHERE debt_facility_id = $1`,
    [context.debtFacilityId, input.principalDueMinor.toString(), input.interestDueMinor.toString()],
  );
  await recordAudit(
    "assumption.updated",
    input.actor,
    `cash_in ${input.cashInMinor.toString()} cash_out ${input.cashOutOperatingMinor.toString()} principal ${input.principalDueMinor.toString()} interest ${input.interestDueMinor.toString()}`,
  );
}

export async function resetLedger(actor: string): Promise<number> {
  await ensureDb();
  const pool = getPool();
  const result = await pool.query(`UPDATE invoices SET status = 'void' WHERE anchor = false AND status <> 'void'`);
  const count = result.rowCount ?? 0;
  await recordAudit("ledger.reset", actor, `voided ${count} non-anchor invoices`);
  return count;
}

export async function bootstrap(): Promise<BootstrapView> {
  const context = await loadContext();
  const config = appConfig();
  return {
    businessName: context.businessName,
    baseCurrency: context.baseCurrency,
    demo: demoFlags(),
    models: {
      extract: config.extractModel,
      explain: config.explainModel,
      vision: config.visionModel,
      baseUrl: config.nebiusBaseUrl,
    },
    assumptions: {
      cashInMinor: context.cashInMinor.toString(),
      cashOutOperatingMinor: context.cashOutOperatingMinor.toString(),
      principalDueMinor: context.principalDueMinor.toString(),
      interestDueMinor: context.interestDueMinor.toString(),
    },
    ceilings: context.ceilings.map((ceiling) => ({
      descriptionKey: ceiling.descriptionKey,
      ceilingUnitPriceMinor: ceiling.ceilingUnitPriceMinor.toString(),
    })),
    gps: "deferred",
  };
}
