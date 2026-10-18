"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { debtServiceMinor, maxPaymentMinor, minAvailableMinor } from "@/lib/engine/money";
import { formatDscr, formatMinor, majorToMinor, minorToMajorInput } from "@/lib/engine/format";
import { SAMPLE_BLURBS, findingText, outcomeLabel, scenarioLabel, t, type Lang } from "@/lib/i18n";
import type { BootstrapView, DecisionListItem, DecisionView } from "@/lib/view";

type AuditRow = {
  auditId: string;
  decisionId: string | null;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
};

const ACTIVE_ROW: Record<DecisionView["outcome"], string | null> = {
  PAY: "paid_full",
  PARTIAL: "partial_max",
  HOLD: "held",
  INSUFFICIENT: null,
};

export function NexusApp() {
  const [lang, setLang] = useState<Lang>("th");
  const [boot, setBoot] = useState<BootstrapView | null>(null);
  const [history, setHistory] = useState<DecisionListItem[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [decision, setDecision] = useState<DecisionView | null>(null);
  const [actor, setActor] = useState("เจ้าของร้าน");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cashIn, setCashIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");

  async function reloadLists() {
    const [decisionsRes, auditRes] = await Promise.all([fetch("/api/decisions"), fetch("/api/audit")]);
    if (decisionsRes.ok) setHistory(await decisionsRes.json());
    if (auditRes.ok) setAudit(await auditRes.json());
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("arween-lang");
    if (stored === "en" || stored === "th") setLang(stored);
    void (async () => {
      const response = await fetch("/api/bootstrap");
      if (!response.ok) {
        setError(await response.text());
        return;
      }
      const data = (await response.json()) as BootstrapView;
      setBoot(data);
      setCashIn(minorToMajorInput(BigInt(data.assumptions.cashInMinor)));
      setCashOut(minorToMajorInput(BigInt(data.assumptions.cashOutOperatingMinor)));
      setPrincipal(minorToMajorInput(BigInt(data.assumptions.principalDueMinor)));
      setInterest(minorToMajorInput(BigInt(data.assumptions.interestDueMinor)));
      await reloadLists();
    })();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem("arween-lang", lang);
  }, [lang]);

  const preview = useMemo(() => {
    const values = [cashIn, cashOut, principal, interest].map(majorToMinor);
    if (values.some((value) => value === null)) return null;
    const [inflow, outflow, principalDue, interestDue] = values as bigint[];
    const debt = debtServiceMinor(principalDue, interestDue);
    return {
      debt,
      min: minAvailableMinor(debt),
      max: maxPaymentMinor(inflow, outflow, debt),
    };
  }, [cashIn, cashOut, principal, interest]);

  async function run(body: FormData | Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: body instanceof FormData
          ? { "Idempotency-Key": crypto.randomUUID() }
          : { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: body instanceof FormData ? body : JSON.stringify({ ...body, actor }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setDecision(null);
        setError(payload.error ?? "Request failed");
        return;
      }
      setDecision(payload.decision as DecisionView);
      await reloadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssumptions() {
    if (!preview) {
      setError(lang === "th" ? "ใส่จำนวนเงินที่ไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" : "Enter non-negative amounts with at most 2 decimals.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/assumptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor,
        cashInMinor: majorToMinor(cashIn)!.toString(),
        cashOutOperatingMinor: majorToMinor(cashOut)!.toString(),
        principalDueMinor: majorToMinor(principal)!.toString(),
        interestDueMinor: majorToMinor(interest)!.toString(),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Could not save");
      return;
    }
    setNotice(lang === "th" ? "บันทึกสมมติฐานแล้ว บิลถัดไปจะใช้ตัวเลขนี้" : "Assumptions saved. The next bill uses these figures.");
  }

  async function resetLedger() {
    setBusy(true);
    await fetch("/api/ledger/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor }),
    });
    setBusy(false);
    setNotice(lang === "th" ? "ยกเลิกบิลที่ไม่ใช่ตัวตั้งต้นแล้ว" : "Non-anchor invoices were voided.");
    await reloadLists();
  }

  async function act(kind: "confirm" | "reject") {
    if (!decision) return;
    setBusy(true);
    const response = await fetch(`/api/decisions/${decision.decisionId}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "Could not update");
      return;
    }
    setDecision(payload as DecisionView);
    await reloadLists();
  }

  async function openDecision(decisionId: string) {
    const response = await fetch(`/api/decisions/${decisionId}`);
    if (!response.ok) return;
    setDecision(await response.json());
  }

  const currency = boot?.baseCurrency ?? "THB";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">A</div>
          <div>
            <h1>{t(lang, "product")}</h1>
            <p>{t(lang, "tagline")}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLang(lang === "th" ? "en" : "th")}>
          {t(lang, "language")}
        </Button>
      </header>

      {boot && (boot.demo.nebius || boot.demo.tavily) && (
        <div className="banner">
          {boot.demo.nebius && <p>{t(lang, "demoNebius")}</p>}
          {boot.demo.tavily && <p>{t(lang, "demoTavily")}</p>}
        </div>
      )}
      {boot && !boot.demo.nebius && !boot.demo.tavily && <div className="banner">{t(lang, "liveNote")}</div>}

      <Tabs.Root defaultValue="review">
        <Tabs.List className="tabs">
          <Tabs.Trigger value="review">{t(lang, "review")}</Tabs.Trigger>
          <Tabs.Trigger value="history">{t(lang, "history")}</Tabs.Trigger>
          <Tabs.Trigger value="audit">{t(lang, "audit")}</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="review">
          <div className="layout">
            <section className="panel">
              <h2>{t(lang, "assumptions")}</h2>
              <p className="hint">{boot?.businessName}</p>
              <div className="fields">
                <label>{t(lang, "cashIn")}<input value={cashIn} onChange={(event) => setCashIn(event.target.value)} inputMode="decimal" /></label>
                <label>{t(lang, "cashOut")}<input value={cashOut} onChange={(event) => setCashOut(event.target.value)} inputMode="decimal" /></label>
                <label>{t(lang, "principal")}<input value={principal} onChange={(event) => setPrincipal(event.target.value)} inputMode="decimal" /></label>
                <label>{t(lang, "interest")}<input value={interest} onChange={(event) => setInterest(event.target.value)} inputMode="decimal" /></label>
              </div>
              {preview && (
                <div className="stats">
                  <div><span>{t(lang, "debtService")}</span><strong>{formatMinor(preview.debt, currency)}</strong></div>
                  <div><span>{t(lang, "minCash")}</span><strong>{formatMinor(preview.min, currency)}</strong></div>
                  <div><span>{t(lang, "maxPay")}</span><strong>{formatMinor(preview.max, currency)}</strong></div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button onClick={() => void saveAssumptions()} disabled={busy}>{t(lang, "saveAssumptions")}</Button>
                <Button variant="outline" onClick={() => void resetLedger()} disabled={busy}>{t(lang, "reset")}</Button>
              </div>
              {boot && boot.ceilings[0] && (
                <p className="hint" style={{ marginTop: 10 }}>
                  {t(lang, "ceiling")}: {formatMinor(BigInt(boot.ceilings[0].ceilingUnitPriceMinor), currency)}
                </p>
              )}

              <h2 style={{ marginTop: 18 }}>{t(lang, "samples")}</h2>
              <p className="hint">{t(lang, "samplesHint")}</p>
              <div className="samples">
                {(["A", "B", "C"] as const).map((sample) => (
                  <button key={sample} className="sample" disabled={busy} onClick={() => void run({ sample })}>
                    <b>{lang === "th" ? `เคส ${sample}` : `Case ${sample}`}</b>
                    <span>{SAMPLE_BLURBS[lang][sample]}</span>
                  </button>
                ))}
              </div>

              <h2 style={{ marginTop: 18 }}>{t(lang, "upload")}</h2>
              <p className="hint">{t(lang, "uploadHint")}</p>
              <label className="drop">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.json,application/pdf,text/plain,application/json"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const form = new FormData();
                    form.set("file", file);
                    form.set("actor", actor);
                    void run(form);
                  }}
                />
              </label>
              <div className="stack">
                <label>{t(lang, "paste")}<textarea value={paste} onChange={(event) => setPaste(event.target.value)} /></label>
                <label>{t(lang, "actor")}<input value={actor} onChange={(event) => setActor(event.target.value)} /></label>
              </div>
              <div style={{ marginTop: 8 }}>
                <Button variant="teal" disabled={busy || !paste.trim()} onClick={() => void run({ text: paste })}>
                  {t(lang, "runPaste")}
                </Button>
              </div>
            </section>

            <section>
              {busy && <p className="panel">{t(lang, "working")}</p>}
              {error && <div className="verdict INSUFFICIENT"><p className="kicker">INSUFFICIENT</p><h2>{outcomeLabel(lang, "INSUFFICIENT")}</h2><p className="explain">{error}</p></div>}
              {notice && <p className="banner">{notice}</p>}
              {!decision && !error && (
                <div className="panel">
                  <h2>{t(lang, "emptyTitle")}</h2>
                  <p className="hint">{t(lang, "emptyBody")}</p>
                  {boot && (
                    <p className="meta">
                      extract {boot.models.extract}<br />
                      explain {boot.models.explain}<br />
                      vision {boot.models.vision}<br />
                      {boot.models.baseUrl}
                    </p>
                  )}
                </div>
              )}
              {decision && <DecisionCard lang={lang} decision={decision} busy={busy} onAct={(kind) => void act(kind)} />}
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="history">
          <div className="history">
            {history.length === 0 && <p className="panel">{t(lang, "historyEmpty")}</p>}
            {history.map((item) => (
              <button key={item.decisionId} onClick={() => void openDecision(item.decisionId)}>
                <strong className={item.outcome}>{outcomeLabel(lang, item.outcome)}</strong>
                <span> · {item.invoiceNumber} · {item.supplierLegalName}</span>
                <div className="meta">{formatMinor(BigInt(item.totalMinor), item.currency)} · {item.winningRuleId} · {item.status} · {item.createdAt}</div>
              </button>
            ))}
          </div>
          {decision && <div style={{ marginTop: 16 }}><DecisionCard lang={lang} decision={decision} busy={busy} onAct={(kind) => void act(kind)} /></div>}
        </Tabs.Content>

        <Tabs.Content value="audit">
          <div className="history">
            {audit.length === 0 && <p className="panel">{t(lang, "auditEmpty")}</p>}
            {audit.map((row) => (
              <article key={row.auditId} className="audit-row">
                <strong>{row.action}</strong>
                <div>{row.detail}</div>
                <div className="meta">{row.actor} · {row.createdAt}{row.decisionId ? ` · ${row.decisionId}` : ""}</div>
              </article>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </main>
  );
}

function DecisionCard({
  lang,
  decision,
  busy,
  onAct,
}: {
  lang: Lang;
  decision: DecisionView;
  busy: boolean;
  onAct: (kind: "confirm" | "reject") => void;
}) {
  const currency = decision.invoice.currency;
  const active = ACTIVE_ROW[decision.outcome];
  return (
    <article className={`verdict ${decision.outcome}`}>
      <p className="kicker">{decision.winningRuleId} · {statusLabel(lang, decision.status)}</p>
      <h2>{outcomeLabel(lang, decision.outcome)}</h2>
      <p className="explain">{lang === "th" ? decision.explanationTh : decision.explanationEn}</p>
      <p className="meta">{decision.explanationSource === "model" ? t(lang, "accepted") : t(lang, "replaced")} · {t(lang, "fault")} · {t(lang, "noMoney")}</p>
      {decision.partialAmountMinor && (
        <p><strong>{t(lang, "partialCap")}: {formatMinor(BigInt(decision.partialAmountMinor), currency)}</strong></p>
      )}
      <p className="meta">
        {decision.invoice.supplierLegalName} · {decision.invoice.invoiceNumber} · {t(lang, "confidence")} {decision.invoice.confidenceBps / 100}%
      </p>
      <p className="meta">{t(lang, "gps")}</p>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button variant="teal" disabled={busy || decision.status !== "proposed"} onClick={() => onAct("confirm")}>{t(lang, "approve")}</Button>
        <Button variant="danger" disabled={busy || decision.status !== "proposed"} onClick={() => onAct("reject")}>{t(lang, "reject")}</Button>
      </div>

      <h3 style={{ marginTop: 18 }}>{t(lang, "scenarios")}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{lang === "th" ? "สถานการณ์" : "Scenario"}</th>
              <th className="num">{lang === "th" ? "ยอดจ่าย" : "Payment"}</th>
              <th className="num">{lang === "th" ? "เงินสดคงเหลือ" : "Cash left"}</th>
              <th className="num">DSCR</th>
              <th>{lang === "th" ? "เกณฑ์" : "Threshold"}</th>
            </tr>
          </thead>
          <tbody>
            {decision.scenarios.map((scenario) => (
              <tr key={scenario.kind} className={scenario.kind === active ? "active" : ""}>
                <td>{scenarioLabel(lang, scenario.kind)}</td>
                <td className="num">{formatMinor(BigInt(scenario.decisionPaymentMinor), currency)}</td>
                <td className="num">{formatMinor(BigInt(scenario.cashAvailableMinor), currency)}</td>
                <td className="num">{scenario.dscrMicros ? formatDscr(BigInt(scenario.dscrMicros)) : "—"}</td>
                <td>{scenario.dscrMicros ? (scenario.passesDscr ? t(lang, "passes") : t(lang, "misses")) : t(lang, "noDebt")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{t(lang, "lines")}</h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {decision.invoice.lines.map((line) => (
              <tr key={line.lineNo}>
                <td>{line.lineNo}. {line.description}</td>
                <td className="num">{formatMinor(BigInt(line.lineTotalMinor), currency)}</td>
              </tr>
            ))}
            <tr>
              <td>{lang === "th" ? "ยอดสุทธิ" : "Total"}</td>
              <td className="num">{formatMinor(BigInt(decision.invoice.totalMinor), currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{t(lang, "rules")}</h3>
      <div className="rules">
        {decision.findings.map((finding) => (
          <div key={finding.ruleId} className="rule">
            <strong>{finding.ruleId}</strong>
            <span className={`pill ${finding.status === "pass" ? "pass" : finding.severity === "warn" ? "warn" : finding.severity === "info" ? "info" : "fail"}`}>
              {finding.status}
            </span>
            <span>{findingText(lang, finding.detailKey, finding.params)}</span>
          </div>
        ))}
      </div>

      <h3>{t(lang, "evidence")}</h3>
      <p className="meta">
        {decision.retrieval?.provider} · {decision.retrieval?.taxIdFound ? t(lang, "taxHit") : t(lang, "taxMiss")} · {decision.retrieval?.taxId || "—"}
        <br />
        {decision.retrieval?.query}
      </p>
      <div className="evidence">
        {decision.evidence.length === 0 && <p className="hint">{t(lang, "taxMiss")}</p>}
        {decision.evidence.map((hit) => (
          <article key={hit.url}>
            <a href={hit.url} target="_blank" rel="noreferrer">{hit.title}</a>
            <div className="meta">{hit.demo ? t(lang, "sourceDemo") : t(lang, "sourceLive")} · {hit.containsTaxId ? t(lang, "taxHit") : t(lang, "taxMiss")}</div>
            {hit.snippet && <p>{hit.snippet}</p>}
          </article>
        ))}
      </div>

      <h3>{t(lang, "models")}</h3>
      <div className="rules">
        {decision.models.map((model, index) => (
          <div key={`${model.purpose}-${index}`} className="rule">
            <strong>{model.purpose}</strong>
            <span className={`pill ${model.accepted ? "pass" : "fail"}`}>{model.accepted ? "accepted" : "rejected"}</span>
            <span>{model.provider} · {model.modelId}{model.error ? ` · ${model.error}` : ""}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function statusLabel(lang: Lang, status: DecisionView["status"]): string {
  if (status === "confirmed") return t(lang, "statusConfirmed");
  if (status === "rejected") return t(lang, "statusRejected");
  return t(lang, "statusProposed");
}
