"use client";

import { ArrowUp, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { debtServiceMinor, maxPaymentMinor } from "@/lib/engine/money";
import { formatDscr, formatMinor, majorToMinor, minorToMajorInput } from "@/lib/engine/format";
import { findingText, outcomeLabel, quotaText, rulePurpose, t, type Lang } from "@/lib/i18n";
import { sampleInvoices } from "@/lib/samples";
import type { BootstrapView, DecisionListItem, DecisionView } from "@/lib/view";

type AuditRow = {
  auditId: string;
  decisionId: string | null;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
};

type View = "review" | "decisions" | "history" | "parties" | "cash" | "settings";
type BannerError = { code?: string; fallback: string };

function bannerFromPayload(payload: { error?: unknown; code?: unknown }, fallback: string): BannerError {
  return {
    code: typeof payload.code === "string" ? payload.code : undefined,
    fallback: typeof payload.error === "string" && payload.error.trim() ? payload.error.slice(0, 400) : fallback,
  };
}
type SampleId = "A" | "B" | "C";

const NAV: Array<{ id: View; key: "navReview" | "navDecisions" | "navHistory" | "navParties" | "navCash" | "navSettings" }> = [
  { id: "review", key: "navReview" },
  { id: "decisions", key: "navDecisions" },
  { id: "history", key: "navHistory" },
  { id: "parties", key: "navParties" },
  { id: "cash", key: "navCash" },
  { id: "settings", key: "navSettings" },
];

const TONE: Record<DecisionView["outcome"], { badge: string; banner: string; ring: string; button: string; icon: string }> = {
  PAY: {
    badge: "bg-[#f0fdf4] text-[#16a34a]",
    banner: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    ring: "border-[#16a34a]",
    button: "bg-[#16a34a] text-white hover:bg-[#15803d]",
    icon: "bg-[#dcfce7] text-[#166534]",
  },
  PARTIAL: {
    badge: "bg-[#fffbeb] text-[#d97706]",
    banner: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
    ring: "border-[#f97316]",
    button: "bg-[#ea580c] text-white hover:bg-[#c2410c]",
    icon: "bg-[#ffedd5] text-[#c2410c]",
  },
  HOLD: {
    badge: "bg-[#fef2f2] text-[#dc2626]",
    banner: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
    ring: "border-[#dc2626]",
    button: "bg-[#dc2626] text-white hover:bg-[#b91c1c]",
    icon: "bg-[#fee2e2] text-[#b91c1c]",
  },
  INSUFFICIENT: {
    badge: "bg-[#f5f3ff] text-[#7c3aed]",
    banner: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
    ring: "border-[#7c3aed]",
    button: "bg-[#7c3aed] text-white hover:bg-[#6d28d9]",
    icon: "bg-[#ede9fe] text-[#6d28d9]",
  },
};

const RECOMMENDED: Record<DecisionView["outcome"], DecisionView["scenarios"][number]["kind"] | null> = {
  PAY: "paid_full",
  PARTIAL: "partial_max",
  HOLD: "held",
  INSUFFICIENT: null,
};

export function NexusApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("review");
  const [menuOpen, setMenuOpen] = useState(false);
  const [boot, setBoot] = useState<BootstrapView | null>(null);
  const [history, setHistory] = useState<DecisionListItem[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [decision, setDecision] = useState<DecisionView | null>(null);
  const [actor, setActor] = useState("T. Sripitak");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BannerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cashIn, setCashIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  async function reloadLists() {
    const [decisionsRes, auditRes] = await Promise.all([fetch("/api/decisions"), fetch("/api/audit")]);
    if (decisionsRes.ok) setHistory(await decisionsRes.json());
    if (auditRes.ok) setAudit(await auditRes.json());
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("arween-lang");
    if (stored === "en" || stored === "th") setLang(stored);
    const storedActor = window.localStorage.getItem("arween-actor");
    if (storedActor) setActor(storedActor);
    void (async () => {
      const response = await fetch("/api/bootstrap");
      if (!response.ok) {
        setError({ fallback: (await response.text()).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]").slice(0, 280) });
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

  useEffect(() => {
    window.localStorage.setItem("arween-actor", actor);
  }, [actor]);

  const preview = useMemo(() => {
    const values = [cashIn, cashOut, principal, interest].map(majorToMinor);
    if (values.some((value) => value === null)) return null;
    const [inflow, outflow, principalDue, interestDue] = values as bigint[];
    const debt = debtServiceMinor(principalDue, interestDue);
    return { inflow, outflow, debt, max: maxPaymentMinor(inflow, outflow, debt) };
  }, [cashIn, cashOut, principal, interest]);

  const currency = boot?.baseCurrency ?? "THB";

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
      const payload = (await response.json()) as { error?: unknown; code?: unknown; decision?: DecisionView };
      if (!response.ok) {
        setError(bannerFromPayload(payload, "Request failed"));
        return;
      }
      setDecision(payload.decision as DecisionView);
      setRulesOpen(false);
      setEvidenceOpen(false);
      setView("decisions");
      setMenuOpen(false);
      await reloadLists();
    } catch (err) {
      setError({ fallback: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("actor", actor);
    void run(form);
  }

  async function saveAssumptions() {
    if (!preview) {
      setError({ fallback: lang === "th" ? "ใส่จำนวนเงินที่ไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" : "Enter non-negative amounts with at most 2 decimals." });
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
      const payload = (await response.json()) as { error?: unknown; code?: unknown };
      setError(bannerFromPayload(payload, "Could not save"));
      return;
    }
    setNotice(t(lang, "saved"));
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
    setError(null);
    const response = await fetch(`/api/decisions/${decision.decisionId}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor }),
    });
    const payload = (await response.json()) as { error?: unknown; code?: unknown };
    setBusy(false);
    if (!response.ok) {
      setError(bannerFromPayload(payload, "Could not update"));
      return;
    }
    setDecision(payload as DecisionView);
    await reloadLists();
  }

  async function openDecision(decisionId: string) {
    const response = await fetch(`/api/decisions/${decisionId}`);
    if (!response.ok) return;
    setDecision(await response.json());
    setRulesOpen(false);
    setEvidenceOpen(false);
    setView("decisions");
    setMenuOpen(false);
  }

  function go(next: View) {
    setView(next);
    setMenuOpen(false);
    setError(null);
  }

  const showVerdict = view === "decisions" && decision;

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafafa] text-[#09090b]">
      <aside className="hidden h-full w-[248px] shrink-0 flex-col gap-1 border-r border-[#e4e4e7] bg-white px-4 py-5 md:flex">
        <Brand lang={lang} />
        <Nav lang={lang} view={view} onNavigate={go} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" aria-label={t(lang, "back")} onClick={() => setMenuOpen(false)} />
          <aside className="relative flex h-full w-[248px] flex-col gap-1 bg-white px-4 py-5">
            <Brand lang={lang} />
            <Nav lang={lang} view={view} onNavigate={go} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-10 md:py-8">
          {view !== "decisions" && (
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button className="mt-1 rounded-lg p-1 text-[#09090b] md:hidden" onClick={() => setMenuOpen(true)} aria-label="Menu">
                  <Menu size={20} />
                </button>
                <Header lang={lang} view={view} />
              </div>
              <LangCluster lang={lang} actor={actor} onLang={setLang} />
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]" role="alert" data-testid="app-error">
              {quotaText(lang, error.code, error.fallback)}
            </p>
          )}
          {notice && !showVerdict && <p className="mb-4 rounded-xl border border-[#e4e4e7] bg-white px-4 py-3 text-sm text-[#71717a]">{notice}</p>}

          {view === "review" && (
            <Review
              lang={lang}
              currency={currency}
              preview={preview}
              busy={busy}
              dragOver={dragOver}
              showPaste={showPaste}
              paste={paste}
              boot={boot}
              onDragOver={setDragOver}
              onFile={onFile}
              onTogglePaste={() => setShowPaste((value) => !value)}
              onPaste={setPaste}
              onRunPaste={() => void run({ text: paste })}
              onSample={(sample) => void run({ sample })}
            />
          )}

          {view === "decisions" && !decision && (
            <DecisionList lang={lang} items={history} onOpen={(id) => void openDecision(id)} />
          )}

          {showVerdict && decision && (
            <Verdict
              lang={lang}
              decision={decision}
              actor={actor}
              rulesOpen={rulesOpen}
              evidenceOpen={evidenceOpen}
              onLang={setLang}
              onBack={() => setView("review")}
              onMenu={() => setMenuOpen(true)}
              onToggleRules={() => setRulesOpen((value) => !value)}
              onToggleEvidence={() => setEvidenceOpen((value) => !value)}
            />
          )}

          {view === "history" && (
            <History
              lang={lang}
              items={history}
              audit={audit}
              onOpen={(id) => void openDecision(id)}
            />
          )}

          {view === "parties" && <Parties lang={lang} items={history} />}

          {view === "cash" && (
            <Cash
              lang={lang}
              currency={currency}
              cashIn={cashIn}
              cashOut={cashOut}
              principal={principal}
              interest={interest}
              preview={preview}
              busy={busy}
              onCashIn={setCashIn}
              onCashOut={setCashOut}
              onPrincipal={setPrincipal}
              onInterest={setInterest}
              onSave={() => void saveAssumptions()}
            />
          )}

          {view === "settings" && (
            <Settings
              lang={lang}
              boot={boot}
              actor={actor}
              busy={busy}
              onActor={setActor}
              onReset={() => void resetLedger()}
            />
          )}
        </div>

        {showVerdict && decision && (
          <ActionBar lang={lang} decision={decision} busy={busy} notice={notice} onConfirm={() => void act("confirm")} onReject={() => void act("reject")} onHold={() => setNotice(t(lang, "heldOpen"))} />
        )}
      </div>
    </div>
  );
}

function Brand({ lang }: { lang: Lang }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 pb-1">
      <div className="grid size-8 place-items-center rounded-lg bg-[#09090b] text-sm font-semibold text-white">A</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">ARWEEN-Nexus</div>
        <div className="text-xs text-[#71717a]">{t(lang, "brandSub")}</div>
      </div>
    </div>
  );
}

function Nav({ lang, view, onNavigate }: { lang: Lang; view: View; onNavigate: (view: View) => void }) {
  return (
    <>
      {NAV.map((item) => (
        <button
          key={item.id}
          data-testid={`nav-${item.id}`}
          onClick={() => onNavigate(item.id)}
          className={`w-full rounded-lg px-3 py-2 text-left text-sm ${view === item.id ? "bg-[#f4f4f5] font-semibold text-[#09090b]" : "text-[#71717a] hover:bg-[#fafafa]"}`}
        >
          {t(lang, item.key)}
        </button>
      ))}
    </>
  );
}

function Header({ lang, view }: { lang: Lang; view: View }) {
  const title =
    view === "review" ? t(lang, "newReviewTitle")
      : view === "history" ? t(lang, "historyTitle")
        : view === "parties" ? t(lang, "partiesTitle")
          : view === "cash" ? t(lang, "cashTitle")
            : view === "settings" ? t(lang, "settingsTitle")
              : t(lang, "navDecisions");
  const sub =
    view === "review" ? t(lang, "newReviewSub")
      : view === "history" ? t(lang, "historySub")
        : view === "parties" ? t(lang, "partiesSub")
          : view === "cash" ? t(lang, "cashSub")
            : view === "settings" ? t(lang, "settingsSub")
              : t(lang, "historyEmpty");
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-[#71717a]">{sub}</p>
    </div>
  );
}

function LangCluster({ lang, actor, onLang }: { lang: Lang; actor: string; onLang: (lang: Lang) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="flex rounded-lg bg-[#f4f4f5] p-1">
        {(["th", "en"] as const).map((code) => (
          <button
            key={code}
            data-testid={`lang-${code}`}
            onClick={() => onLang(code)}
            className={`rounded-md px-2.5 py-1 text-xs ${lang === code ? "bg-white font-semibold text-[#09090b]" : "text-[#71717a]"}`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid size-8 place-items-center rounded-full bg-[#e4e4e7] text-xs font-semibold">{initials(actor)}</div>
    </div>
  );
}

function Review({
  lang, currency, preview, busy, dragOver, showPaste, paste, boot, onDragOver, onFile, onTogglePaste, onPaste, onRunPaste, onSample,
}: {
  lang: Lang;
  currency: string;
  preview: { inflow: bigint; outflow: bigint; debt: bigint; max: bigint } | null;
  busy: boolean;
  dragOver: boolean;
  showPaste: boolean;
  paste: string;
  boot: BootstrapView | null;
  onDragOver: (value: boolean) => void;
  onFile: (file: File | undefined) => void;
  onTogglePaste: () => void;
  onPaste: (value: string) => void;
  onRunPaste: () => void;
  onSample: (sample: SampleId) => void;
}) {
  const cards = preview
    ? [
        [t(lang, "cashInPeriod"), formatMinor(preview.inflow, currency)],
        [t(lang, "operatingOut"), formatMinor(preview.outflow, currency)],
        [t(lang, "debtCard"), formatMinor(preview.debt, currency)],
        [t(lang, "maxSafe"), formatMinor(preview.max, currency)],
      ]
    : [];
  const samples: Array<{ id: SampleId; outcome: DecisionView["outcome"]; blurb: "caseABlurb" | "caseBBlurb" | "caseCBlurb" }> = [
    { id: "A", outcome: "PAY", blurb: "caseABlurb" },
    { id: "B", outcome: "PARTIAL", blurb: "caseBBlurb" },
    { id: "C", outcome: "HOLD", blurb: "caseCBlurb" },
  ];
  return (
    <div className="flex flex-col gap-6">
      {boot?.demo.tavily && <p className="text-sm text-[#71717a]">{t(lang, "demoTavily")}</p>}
      <label
        data-testid="dropzone"
        onDragOver={(event) => { event.preventDefault(); onDragOver(true); }}
        onDragLeave={() => onDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          onDragOver(false);
          onFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white md:h-[300px] ${dragOver ? "border-[#09090b]" : "border-[#d4d4d8]"}`}
      >
        <span className="grid size-14 place-items-center rounded-full bg-[#f4f4f5]"><ArrowUp size={22} /></span>
        <span className="text-lg font-semibold">{busy ? t(lang, "workingShort") : t(lang, "dropTitle")}</span>
        <span className="text-sm text-[#71717a]">{t(lang, "dropHint")}</span>
        <span className="rounded-lg bg-[#09090b] px-4 py-2.5 text-sm font-semibold text-white">{t(lang, "browse")}</span>
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.json,application/pdf,text/plain,application/json"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
      </label>
      <button className="self-start text-sm text-[#71717a] underline-offset-2 hover:underline" onClick={onTogglePaste}>{t(lang, "pasteToggle")}</button>
      {showPaste && (
        <div className="flex flex-col gap-2">
          <textarea className="min-h-24 rounded-xl border border-[#e4e4e7] bg-white p-3 text-sm" value={paste} onChange={(event) => onPaste(event.target.value)} />
          <button className="self-start rounded-lg border border-[#e4e4e7] bg-white px-4 py-2 text-sm font-semibold" disabled={busy || !paste.trim()} onClick={onRunPaste}>{t(lang, "runPaste")}</button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#e4e4e7] bg-white p-5">
            <div className="text-xs text-[#71717a]">{label}</div>
            <div className="mt-3 text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t(lang, "trySample")}</h2>
          <span className="text-[13px] text-[#71717a]">{t(lang, "sampleNote")}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {samples.map((sample) => {
            const invoice = sampleInvoices[sample.id];
            return (
              <article key={sample.id} className="flex flex-col gap-3 rounded-xl border border-[#e4e4e7] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">{lang === "th" ? `เคส ${sample.id}` : `Case ${sample.id}`}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[sample.outcome].badge}`}>{sample.outcome}</span>
                </div>
                <p className="text-[13px] text-[#71717a]">{invoice.invoiceNumber} · {invoice.supplierLegalName}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMinor(invoice.totalMinor, invoice.currency)}</p>
                <p className="text-xs text-[#71717a]">{t(lang, sample.blurb)}</p>
                <button
                  data-testid={`sample-${sample.id}`}
                  disabled={busy}
                  onClick={() => onSample(sample.id)}
                  className="mt-auto w-full rounded-lg border border-[#e4e4e7] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {t(lang, "runSample")} {sample.id}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DecisionList({ lang, items, onOpen }: { lang: Lang; items: DecisionListItem[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-[#71717a]">{t(lang, "historyEmpty")}</p>;
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <button key={item.decisionId} onClick={() => onOpen(item.decisionId)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e4e7] bg-white px-5 py-4 text-left">
          <div>
            <div className="font-semibold">{item.invoiceNumber} · {item.supplierLegalName}</div>
            <div className="mt-1 text-sm text-[#71717a]">{formatWhen(item.createdAt, lang)} · {item.winningRuleId}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-sm font-semibold">{formatMinor(BigInt(item.totalMinor), item.currency)}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[item.outcome].badge}`}>{item.outcome}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Verdict({
  lang, decision, actor, rulesOpen, evidenceOpen, onLang, onBack, onMenu, onToggleRules, onToggleEvidence,
}: {
  lang: Lang;
  decision: DecisionView;
  actor: string;
  rulesOpen: boolean;
  evidenceOpen: boolean;
  onLang: (lang: Lang) => void;
  onBack: () => void;
  onMenu: () => void;
  onToggleRules: () => void;
  onToggleEvidence: () => void;
}) {
  const tone = TONE[decision.outcome];
  const currency = decision.invoice.currency;
  const paid = decision.scenarios.find((scenario) => scenario.kind === "paid_full");
  const headline = verdictHeadline(lang, decision, currency);
  const detail = verdictDetail(lang, decision, currency);
  const passCount = decision.findings.filter((finding) => finding.status === "pass").length;
  const failCount = decision.findings.filter((finding) => finding.status === "fail").length;
  return (
    <div data-testid="verdict">
      <div className="mb-4 flex items-center justify-between md:hidden">
        <button data-testid="mobile-back" className="text-sm font-medium" onClick={onBack}>← {decision.invoice.invoiceNumber}</button>
        <div className="flex rounded-lg bg-[#f4f4f5] p-0.5">
          {(["th", "en"] as const).map((code) => (
            <button key={code} data-testid={`lang-${code}`} onClick={() => onLang(code)} className={`rounded-md px-2 py-0.5 text-xs ${lang === code ? "bg-white font-semibold" : "text-[#71717a]"}`}>{code.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="mb-6 hidden items-start justify-between gap-4 md:flex">
        <div className="flex items-start gap-3">
          <button className="mt-1 rounded-lg p-1 lg:hidden" onClick={onMenu} aria-label="Menu"><Menu size={20} /></button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{decision.invoice.invoiceNumber} · {decision.invoice.supplierLegalName}</h1>
            <p className="mt-1 text-sm text-[#71717a]">
              {t(lang, "uploaded")} {formatWhen(decision.createdAt, lang)} (UTC+7) · {t(lang, "decisionWord")} {shortId(decision.decisionId)} · {t(lang, "statusWord")}: {statusWord(lang, decision.status)}
            </p>
          </div>
        </div>
        <LangCluster lang={lang} actor={actor} onLang={onLang} />
      </div>

      <section className={`mb-4 hidden items-center justify-between gap-4 rounded-xl border px-6 py-5 md:flex ${tone.banner}`}>
        <div className="flex items-center gap-4">
          <div className={`grid size-12 place-items-center rounded-full text-2xl font-semibold ${tone.icon}`}>!</div>
          <div>
            <h2 className="text-2xl font-semibold" data-testid="outcome">{headline}</h2>
            <p className="mt-1 text-sm">{detail}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">{t(lang, "invoiceTotal")}</div>
          <div className="text-xl font-semibold tabular-nums">{formatMinor(BigInt(decision.invoice.totalMinor), currency)}</div>
        </div>
      </section>

      <section className={`mb-4 rounded-xl border p-4 md:hidden ${tone.banner}`}>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>{decision.outcome}</span>
        <h2 className="mt-2 text-2xl font-semibold" data-testid="outcome">{headline.replace(`${decision.outcome} — `, "")}</h2>
        <p className="mt-2 text-sm">{formatMinor(BigInt(decision.invoice.totalMinor), currency)} · {decision.invoice.supplierLegalName}</p>
        <p className="mt-1 text-xs">{t(lang, "colRule")}: {decision.winningRuleId}</p>
      </section>

      <h3 className="mb-3 text-base font-semibold md:sr-only">{t(lang, "scenariosTitle")}</h3>
      <div className="mb-4 hidden gap-4 md:grid md:grid-cols-3">
        {decision.scenarios.map((scenario) => (
          <ScenarioCard key={scenario.kind} lang={lang} scenario={scenario} currency={currency} recommended={scenario.kind === RECOMMENDED[decision.outcome]} tone={tone} />
        ))}
      </div>
      <div className="mb-4 flex flex-col gap-3 md:hidden">
        {[...decision.scenarios].sort((a, b) => rank(a.kind, decision.outcome) - rank(b.kind, decision.outcome)).map((scenario) => (
          <MobileScenario key={scenario.kind} lang={lang} scenario={scenario} currency={currency} recommended={scenario.kind === RECOMMENDED[decision.outcome]} tone={tone} />
        ))}
        <div className="rounded-xl border border-[#e4e4e7] bg-white px-4 py-3 text-sm">
          <button className="flex w-full items-center justify-between py-1" onClick={onToggleRules}>
            <span>{t(lang, "ruleChecks")}</span>
            <span className="text-[#71717a]">{passCount} {t(lang, "pass").toLowerCase()} · {failCount} {t(lang, "fail").toLowerCase()} ›</span>
          </button>
          <button className="flex w-full items-center justify-between py-1" onClick={onToggleEvidence}>
            <span>{t(lang, "evidenceSources")}</span>
            <span className="text-[#71717a]">{sourceCountLabel(lang, decision)} ›</span>
          </button>
          {(rulesOpen || evidenceOpen) && (
            <div className="mt-3 border-t border-[#e4e4e7] pt-3">
              {rulesOpen && <RuleList lang={lang} decision={decision} />}
              {evidenceOpen && <EvidenceBlock lang={lang} decision={decision} />}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 hidden gap-4 md:grid md:grid-cols-2">
        <InvoicePaper lang={lang} decision={decision} />
        <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t(lang, "extracted")}</h3>
            <span className="text-xs text-[#71717a]">{modelShort(extractModel(decision))} · {t(lang, "confidence").toLowerCase()} {(decision.invoice.confidenceBps / 100).toFixed(1)}%</span>
          </div>
          <Field label={t(lang, "supplier")} value={decision.invoice.supplierLegalName} />
          <Field label={t(lang, "taxId")} value={decision.invoice.supplierTaxId ?? "—"} />
          <Field label={t(lang, "currencyVat")} value={`${decision.invoice.currency} · ${decision.invoice.vatRateBps} bps`} />
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t(lang, "ruleChecks")}</h3>
          <RuleList lang={lang} decision={decision} />
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t(lang, "sources")} ({sourceName(decision)})</h3>
          <EvidenceBlock lang={lang} decision={decision} />
          <p className="mt-4 text-xs leading-5 text-[#71717a]">{lang === "th" ? decision.explanationTh : decision.explanationEn}</p>
        </div>
      </div>
      {paid && <p className="sr-only">DSCR {paid.dscrMicros ? formatDscr(BigInt(paid.dscrMicros)) : ""}</p>}
    </div>
  );
}

function ScenarioCard({
  lang, scenario, currency, recommended, tone,
}: {
  lang: Lang;
  scenario: DecisionView["scenarios"][number];
  currency: string;
  recommended: boolean;
  tone: (typeof TONE)["PAY"];
}) {
  const title = scenario.kind === "held" ? t(lang, "hold") : scenario.kind === "paid_full" ? (lang === "th" ? "จ่ายเต็ม" : "Pay in full") : (lang === "th" ? "จ่ายไม่เกินเพดาน" : "Partial max");
  return (
    <article className={`rounded-xl border bg-white p-5 ${recommended ? `border-2 ${tone.ring}` : "border-[#e4e4e7]"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {recommended && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>{t(lang, "recommended")}</span>}
      </div>
      <p className="mt-3 text-sm text-[#71717a]">{t(lang, "paymentLabel")} {formatMinor(BigInt(scenario.decisionPaymentMinor), currency)}</p>
      <p className="mt-3 text-xs text-[#71717a]">{t(lang, "cashAfter")}</p>
      <p className="text-xl font-semibold tabular-nums">{formatMinor(BigInt(scenario.cashAvailableMinor), currency)}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-[#71717a]">DSCR {scenario.dscrMicros ? formatDscr(BigInt(scenario.dscrMicros)) : "—"} {t(lang, "vsThreshold")}</span>
        <PassFail lang={lang} pass={scenario.passesDscr} />
      </div>
    </article>
  );
}

function MobileScenario({
  lang, scenario, currency, recommended, tone,
}: {
  lang: Lang;
  scenario: DecisionView["scenarios"][number];
  currency: string;
  recommended: boolean;
  tone: (typeof TONE)["PAY"];
}) {
  const title = scenario.kind === "held"
    ? `${t(lang, "hold")} · ${moneyOnly(scenario.decisionPaymentMinor)}`
    : scenario.kind === "paid_full"
      ? `${lang === "th" ? "จ่ายเต็ม" : "Pay in full"} · ${moneyOnly(scenario.decisionPaymentMinor)}`
      : `${lang === "th" ? "จ่ายไม่เกินเพดาน" : "Partial max"} · ${moneyOnly(scenario.decisionPaymentMinor)}`;
  return (
    <article className={`rounded-xl border bg-white px-4 py-3 ${recommended ? `border-2 ${tone.ring}` : "border-[#e4e4e7]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {recommended ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>{t(lang, "recommended")}</span> : <PassFail lang={lang} pass={scenario.passesDscr} />}
      </div>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-lg font-semibold tabular-nums">{formatMinor(BigInt(scenario.cashAvailableMinor), currency)}</span>
        <span className="text-sm text-[#71717a]">DSCR {scenario.dscrMicros ? formatDscr(BigInt(scenario.dscrMicros)) : "—"}</span>
      </div>
    </article>
  );
}

function InvoicePaper({ lang, decision }: { lang: Lang; decision: DecisionView }) {
  const currency = decision.invoice.currency;
  const rate = (decision.invoice.vatRateBps / 100).toString();
  return (
    <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold">{t(lang, "invoiceDoc")}</h3>
      <div className="rounded-lg bg-[#fafafa] p-6 text-sm">
        <p className="font-semibold uppercase">{decision.invoice.supplierLegalName}</p>
        <p className="mt-1 text-xs text-[#71717a]">{t(lang, "taxId")} {decision.invoice.supplierTaxId ?? "—"}</p>
        <p className="mt-3 font-semibold">TAX INVOICE {decision.invoice.invoiceNumber}</p>
        <p className="mt-1 text-xs text-[#71717a]">{t(lang, "issue")} {decision.invoice.issueDate} · {t(lang, "due")} {decision.invoice.dueDate}</p>
        <div className="mt-4 space-y-2">
          {decision.invoice.lines.map((line) => (
            <div key={line.lineNo} className="flex justify-between gap-3">
              <span>{line.description} ×{formatQty(line.quantityMillis)} @ {moneyOnly(line.unitPriceMinor)}</span>
              <span className="tabular-nums">{moneyOnly(line.lineTotalMinor)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-[#e4e4e7] pt-3">
          <div className="flex justify-between"><span>{t(lang, "subtotal")}</span><span className="tabular-nums">{moneyOnly(decision.invoice.subtotalMinor)}</span></div>
          <div className="flex justify-between"><span>{t(lang, "vat")} {rate}%</span><span className="tabular-nums">{moneyOnly(decision.invoice.vatMinor)}</span></div>
          <div className="flex justify-between font-semibold"><span>{t(lang, "total")} ({currency})</span><span className="tabular-nums">{moneyOnly(decision.invoice.totalMinor)}</span></div>
        </div>
      </div>
    </section>
  );
}

function RuleList({ lang, decision }: { lang: Lang; decision: DecisionView }) {
  return (
    <div className="space-y-2">
      {decision.findings.map((finding) => (
        <div key={finding.ruleId} className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-xs font-semibold">{finding.ruleId}</div>
            <div className="text-xs text-[#71717a]">
              {finding.detailKey === "not_verified" ? findingText(lang, finding.detailKey, finding.params) : rulePurpose(lang, finding.ruleId)}
            </div>
          </div>
          <StatusPill lang={lang} finding={finding} />
        </div>
      ))}
    </div>
  );
}

function EvidenceBlock({ lang, decision }: { lang: Lang; decision: DecisionView }) {
  if (decision.retrieval?.provider === "not_verified" || decision.evidence.length === 0) {
    return <p className="text-xs text-[#71717a]">{decision.retrieval?.provider === "not_verified" ? t(lang, "taxNotVerified") : t(lang, "noSources")}</p>;
  }
  return (
    <div className="space-y-1">
      {decision.evidence.map((hit) => (
        <a key={hit.url} href={hit.url} className="block text-xs text-[#2563eb] hover:underline" target="_blank" rel="noreferrer">
          ↗ {hit.title}
        </a>
      ))}
    </div>
  );
}

function ActionBar({
  lang, decision, busy, notice, onConfirm, onReject, onHold,
}: {
  lang: Lang;
  decision: DecisionView;
  busy: boolean;
  notice: string | null;
  onConfirm: () => void;
  onReject: () => void;
  onHold: () => void;
}) {
  const tone = TONE[decision.outcome];
  const locked = busy || decision.status !== "proposed";
  const amount = decision.outcome === "PARTIAL" && decision.partialAmountMinor
    ? formatMinor(BigInt(decision.partialAmountMinor), decision.invoice.currency)
    : formatMinor(BigInt(decision.invoice.totalMinor), decision.invoice.currency);
  const approve =
    decision.outcome === "PARTIAL" ? `${t(lang, "approvePartial")} ${amount}`
      : decision.outcome === "PAY" ? `${t(lang, "approvePay")} ${amount}`
        : decision.outcome === "HOLD" ? t(lang, "confirmHold")
          : t(lang, "recordInsufficient");
  return (
    <div className="border-t border-[#e4e4e7] bg-white px-4 py-3 md:px-10">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className={`text-sm text-[#71717a] ${notice ? "" : "hidden md:block"}`}>{notice ?? t(lang, "proposeNote")}</p>
        <button data-testid="approve" disabled={locked} onClick={onConfirm} className={`order-first w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 md:order-last md:w-auto ${tone.button}`}>{approve}</button>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <button data-testid="reject" disabled={locked} onClick={onReject} className="rounded-lg border border-[#e4e4e7] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{t(lang, "reject")}</button>
          <button data-testid="hold" disabled={busy || decision.status !== "proposed"} onClick={onHold} className="rounded-lg bg-[#09090b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t(lang, "hold")}</button>
        </div>
      </div>
    </div>
  );
}

function History({
  lang, items, audit, onOpen,
}: {
  lang: Lang;
  items: DecisionListItem[];
  audit: AuditRow[];
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("7");
  const [rule, setRule] = useState("all");
  const [selected, setSelected] = useState<string | null>(items[0]?.decisionId ?? null);
  const [detail, setDetail] = useState<DecisionView | null>(null);

  const rules = useMemo(() => Array.from(new Set(items.map((item) => item.winningRuleId))), [items]);
  const filtered = useMemo(() => {
    const now = Date.now();
    return items.filter((item) => {
      const blob = `${item.invoiceNumber} ${item.supplierLegalName} ${item.decisionId}`.toLowerCase();
      if (query && !blob.includes(query.toLowerCase())) return false;
      if (outcome !== "all" && item.outcome !== outcome) return false;
      if (status !== "all" && item.status !== status) return false;
      if (rule !== "all" && item.winningRuleId !== rule) return false;
      if (range !== "all") {
        const age = now - new Date(item.createdAt).getTime();
        const days = range === "7" ? 7 : 30;
        if (age > days * 86_400_000) return false;
      }
      return true;
    });
  }, [items, query, outcome, status, range, rule]);
  const counts = {
    all: filtered.length,
    PAY: filtered.filter((item) => item.outcome === "PAY").length,
    PARTIAL: filtered.filter((item) => item.outcome === "PARTIAL").length,
    HOLD: filtered.filter((item) => item.outcome === "HOLD").length,
    INSUFFICIENT: filtered.filter((item) => item.outcome === "INSUFFICIENT").length,
  };
  const active = filtered.find((item) => item.decisionId === selected) ?? filtered[0] ?? null;
  const activeId = active?.decisionId ?? null;
  const trail = active ? audit.filter((row) => row.decisionId === active.decisionId) : [];

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    let cancel = false;
    void fetch(`/api/decisions/${activeId}`).then(async (response) => {
      if (!response.ok || cancel) return;
      const payload = (await response.json()) as DecisionView;
      if (!cancel) setDetail(payload);
    });
    return () => {
      cancel = true;
    };
  }, [activeId]);

  function exportCsv() {
    const header = ["time", "invoice", "supplier", "total_minor", "outcome", "winning_rule", "status", "actor", "decision_id"];
    const lines = filtered.map((item) => [item.createdAt, item.invoiceNumber, item.supplierLegalName, item.totalMinor, item.outcome, item.winningRuleId, item.status, item.actor ?? "", item.decisionId].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "arween-decisions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-testid="history">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input data-testid="history-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(lang, "search")} className="h-10 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 text-sm lg:w-80" />
        <Select value={outcome} onChange={setOutcome} label={t(lang, "outcomeAll")} options={[["all", t(lang, "outcomeAll")], ["PAY", "PAY"], ["PARTIAL", "PARTIAL"], ["HOLD", "HOLD"], ["INSUFFICIENT", "INSUFFICIENT"]]} />
        <Select value={status} onChange={setStatus} label={t(lang, "statusAll")} options={[["all", t(lang, "statusAll")], ["proposed", t(lang, "statusProposed")], ["confirmed", t(lang, "statusConfirmed")], ["rejected", t(lang, "statusRejected")]]} />
        <Select value={range} onChange={setRange} label={t(lang, "date7")} options={[["7", t(lang, "date7")], ["30", t(lang, "date30")], ["all", t(lang, "dateAll")]]} />
        <Select value={rule} onChange={setRule} label={t(lang, "ruleAny")} options={[["all", t(lang, "ruleAny")], ...rules.map((id) => [id, id] as [string, string])]} />
        <button onClick={exportCsv} className="h-10 rounded-lg border border-[#e4e4e7] bg-white px-4 text-sm font-semibold">{t(lang, "exportCsv")}</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        {(["all", "PAY", "PARTIAL", "HOLD", "INSUFFICIENT"] as const).map((key) => (
          <button key={key} onClick={() => setOutcome(key === "all" ? "all" : key)} className={`rounded-full px-2.5 py-1 ${outcome === key || (key === "all" && outcome === "all") ? "bg-[#09090b] text-white" : "bg-[#f4f4f5] text-[#71717a]"}`}>
            {key === "all" ? `${lang === "th" ? "ทั้งหมด" : "All"} ${counts.all}` : `${key} ${counts[key]}`}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#e4e4e7] bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-[#71717a]">
            <tr>
              {[t(lang, "colTime"), t(lang, "colInvoice"), t(lang, "colSupplier"), t(lang, "colTotal"), t(lang, "colOutcome"), t(lang, "colRule"), t(lang, "colStatus"), t(lang, "colBy")].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-[#71717a]">{t(lang, "noMatch")}</td></tr>}
            {filtered.map((item) => (
              <tr key={item.decisionId} data-testid={`row-${item.invoiceNumber}`} onClick={() => setSelected(item.decisionId)} className={`cursor-pointer border-t border-[#f4f4f5] ${active?.decisionId === item.decisionId ? "bg-[#fafafa]" : ""}`}>
                <td className="px-4 py-3 whitespace-nowrap">{formatWhen(item.createdAt, lang)}</td>
                <td className="px-4 py-3"><button className="font-medium underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(item.decisionId); }}>{item.invoiceNumber}</button></td>
                <td className="px-4 py-3">{item.supplierLegalName}</td>
                <td className="px-4 py-3 tabular-nums">{moneyOnly(item.totalMinor)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[item.outcome].badge}`}>{item.outcome}</span></td>
                <td className="px-4 py-3">{item.winningRuleId}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{statusWord(lang, item.status)}</span></td>
                <td className="px-4 py-3">{item.status === "proposed" ? "—" : item.actor || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && (
        <section className="mt-4 rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h3 className="text-sm font-semibold">{t(lang, "auditTrail")} — {shortId(active.decisionId)} ({active.invoiceNumber})</h3>
          <ul className="mt-3 space-y-2 text-xs text-[#3f3f46]">
            <li>{formatClock(active.createdAt)} · {active.outcome} · {active.winningRuleId} · {formatMinor(BigInt(active.totalMinor), active.currency)}</li>
            {detail?.decisionId === active.decisionId && detail.models.map((model) => (
              <li key={`${model.purpose}-${model.modelId}`}>
                {formatClock(active.createdAt)} · {model.purpose} · {modelShort(model.modelId)}{model.accepted ? "" : ` · ${model.error ?? t(lang, "replaced")}`}
                {model.latencyMs != null ? ` · ${model.latencyMs} ms` : ""}
                {model.promptTokens != null ? ` · ${model.promptTokens}+${model.completionTokens ?? 0} tok` : ""}
              </li>
            ))}
            {detail?.decisionId === active.decisionId && detail.retrieval && (
              <li>
                {formatClock(active.createdAt)} · retrieval · {detail.retrieval.provider} · {detail.evidence.length} {t(lang, "sources").toLowerCase()}
              </li>
            )}
            {trail.map((row) => (
              <li key={row.auditId}>{formatClock(row.createdAt)} · {row.action} · {row.actor} · {row.detail}</li>
            ))}
            {trail.length === 0 && <li className="text-[#71717a]">{t(lang, "auditEmpty")}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

function Parties({ lang, items }: { lang: Lang; items: DecisionListItem[] }) {
  const groups = new Map<string, number>();
  for (const item of items) groups.set(item.supplierLegalName, (groups.get(item.supplierLegalName) ?? 0) + 1);
  const rows = Array.from(groups.entries());
  if (rows.length === 0) return <p className="text-sm text-[#71717a]">{t(lang, "partiesEmpty")}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([name, count]) => (
        <article key={name} className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h3 className="font-semibold">{name}</h3>
          <p className="mt-1 text-sm text-[#71717a]">{count} {t(lang, "invoices")}</p>
        </article>
      ))}
    </div>
  );
}

function Cash({
  lang, currency, cashIn, cashOut, principal, interest, preview, busy, onCashIn, onCashOut, onPrincipal, onInterest, onSave,
}: {
  lang: Lang;
  currency: string;
  cashIn: string;
  cashOut: string;
  principal: string;
  interest: string;
  preview: { debt: bigint; max: bigint } | null;
  busy: boolean;
  onCashIn: (value: string) => void;
  onCashOut: (value: string) => void;
  onPrincipal: (value: string) => void;
  onInterest: (value: string) => void;
  onSave: () => void;
}) {
  const fields = [
    [t(lang, "cashIn"), cashIn, onCashIn],
    [t(lang, "cashOut"), cashOut, onCashOut],
    [t(lang, "principal"), principal, onPrincipal],
    [t(lang, "interest"), interest, onInterest],
  ] as const;
  return (
    <div className="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value, onChange]) => (
          <label key={label} className="text-xs text-[#71717a]">
            {label}
            <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 text-sm text-[#09090b]" />
          </label>
        ))}
      </div>
      {preview && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e4e4e7] bg-white p-4 text-sm"><span className="text-[#71717a]">{t(lang, "debtService")}</span><div className="mt-1 font-semibold tabular-nums">{formatMinor(preview.debt, currency)}</div></div>
          <div className="rounded-xl border border-[#e4e4e7] bg-white p-4 text-sm"><span className="text-[#71717a]">{t(lang, "maxPay")}</span><div className="mt-1 font-semibold tabular-nums">{formatMinor(preview.max, currency)}</div></div>
        </div>
      )}
      <button disabled={busy} onClick={onSave} className="mt-4 rounded-lg bg-[#09090b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t(lang, "saveAssumptions")}</button>
    </div>
  );
}

function Settings({
  lang, boot, actor, busy, onActor, onReset,
}: {
  lang: Lang;
  boot: BootstrapView | null;
  actor: string;
  busy: boolean;
  onActor: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <label className="block text-xs text-[#71717a]">
        {t(lang, "actor")}
        <input value={actor} onChange={(event) => onActor(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 text-sm text-[#09090b]" />
      </label>
      {boot && (
        <div className="rounded-xl border border-[#e4e4e7] bg-white p-5 text-sm">
          <h3 className="font-semibold">{t(lang, "modelsLive")}</h3>
          <p className="mt-2 text-[#71717a]">extract · {boot.models.extract}</p>
          <p className="text-[#71717a]">explain · {boot.models.explain}</p>
          <p className="text-[#71717a]">vision · {boot.models.vision}</p>
          <p className="text-[#71717a]">{boot.models.baseUrl}</p>
          <p className="mt-3">{boot.demo.nebius ? t(lang, "demoNebius") : t(lang, "liveNote")}</p>
          {boot.demo.tavily && <p className="mt-2">{t(lang, "demoTavily")}</p>}
        </div>
      )}
      <button disabled={busy} onClick={onReset} className="rounded-lg border border-[#e4e4e7] bg-white px-4 py-2.5 text-sm font-semibold">{t(lang, "reset")}</button>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-[#e4e4e7] bg-white px-3 text-sm">
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-[#71717a]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function PassFail({ lang, pass }: { lang: Lang; pass: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pass ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"}`}>{pass ? t(lang, "pass").toUpperCase() : t(lang, "fail").toUpperCase()}</span>;
}

function StatusPill({ lang, finding }: { lang: Lang; finding: DecisionView["findings"][number] }) {
  if (finding.detailKey === "not_verified") {
    return <span className="rounded-full bg-[#fffbeb] px-2.5 py-1 text-xs font-semibold text-[#d97706]">{t(lang, "notVerified")}</span>;
  }
  if (finding.status === "pass") {
    return <span className="rounded-full bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#16a34a]">{t(lang, "pass")}</span>;
  }
  if (finding.status === "fail" && finding.severity === "block") {
    return <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-xs font-semibold text-[#dc2626]">{t(lang, "failBlock")}</span>;
  }
  if (finding.status === "fail") {
    return <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-xs font-semibold text-[#dc2626]">{t(lang, "fail")}</span>;
  }
  if (finding.severity === "warn") {
    return <span className="rounded-full bg-[#fffbeb] px-2.5 py-1 text-xs font-semibold text-[#d97706]">{t(lang, "warnLabel")}</span>;
  }
  return <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs font-semibold text-[#71717a]">{finding.status}</span>;
}

function verdictHeadline(lang: Lang, decision: DecisionView, currency: string): string {
  if (decision.outcome === "PARTIAL" && decision.partialAmountMinor) {
    return `${decision.outcome} — ${lang === "th" ? "จ่ายได้ไม่เกิน" : "pay up to"} ${formatMinor(BigInt(decision.partialAmountMinor), currency)}`;
  }
  if (decision.outcome === "PAY") {
    return `${decision.outcome} — ${lang === "th" ? "จ่าย" : "pay"} ${formatMinor(BigInt(decision.invoice.totalMinor), currency)}`;
  }
  if (decision.outcome === "HOLD") return `${decision.outcome} — ${lang === "th" ? "ยังไม่จ่าย" : "do not pay"}`;
  return `${decision.outcome} — ${outcomeLabel(lang, "INSUFFICIENT")}`;
}

function verdictDetail(lang: Lang, decision: DecisionView, currency: string): string {
  const paid = decision.scenarios.find((scenario) => scenario.kind === "paid_full");
  const dscr = paid?.dscrMicros ? formatDscr(BigInt(paid.dscrMicros)) : "—";
  const total = formatMinor(BigInt(decision.invoice.totalMinor), currency);
  if (decision.outcome === "PARTIAL") {
    return lang === "th"
      ? `จ่ายเต็ม ${total} แล้ว DSCR เหลือ ${dscr} (ต่ำกว่า 1.25) กฎที่ชนะ: ${decision.winningRuleId}`
      : `Paying the full ${total} drops DSCR to ${dscr} (below 1.25). Winning rule: ${decision.winningRuleId}`;
  }
  if (decision.outcome === "PAY") {
    return lang === "th"
      ? `จ่ายเต็มแล้วยังได้ DSCR ${dscr} (เกณฑ์ 1.25) กฎที่ชนะ: ${decision.winningRuleId}`
      : `Full payment leaves DSCR ${dscr} (threshold 1.25). Winning rule: ${decision.winningRuleId}`;
  }
  return lang === "th"
    ? `กฎที่ชนะ: ${decision.winningRuleId}`
    : `Winning rule: ${decision.winningRuleId}`;
}

function rank(kind: DecisionView["scenarios"][number]["kind"], outcome: DecisionView["outcome"]): number {
  const recommended = RECOMMENDED[outcome];
  if (kind === recommended) return 0;
  if (kind === "paid_full") return 1;
  if (kind === "held") return 2;
  return 3;
}

function sourceName(decision: DecisionView): string {
  if (!decision.retrieval) return "—";
  if (decision.retrieval.provider === "not_verified") return "not verified";
  return decision.retrieval.provider;
}

function sourceCountLabel(lang: Lang, decision: DecisionView): string {
  if (decision.retrieval?.provider === "not_verified") return t(lang, "notVerified");
  return `${sourceName(decision)} · ${decision.evidence.length}`;
}

function extractModel(decision: DecisionView): string {
  return decision.models.find((model) => model.purpose === "extract")?.modelId ?? "";
}

function modelShort(id: string): string {
  if (id.includes("Nano")) return "Nemotron Nano";
  if (/ultra/i.test(id)) return "Nemotron 3 Ultra";
  if (/super/i.test(id)) return "Nemotron 3 Super";
  return id || "—";
}

function moneyOnly(minor: string): string {
  return formatMinor(BigInt(minor), "").trim();
}

function formatQty(millis: string): string {
  const value = BigInt(millis);
  const whole = value / 1000n;
  const frac = value % 1000n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function formatWhen(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    calendar: "gregory",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function statusWord(lang: Lang, status: DecisionView["status"]): string {
  if (status === "confirmed") return t(lang, "statusConfirmed");
  if (status === "rejected") return t(lang, "statusRejected");
  return t(lang, "statusProposed");
}

function statusTone(status: DecisionView["status"]): string {
  if (status === "confirmed") return "bg-[#f0fdf4] text-[#16a34a]";
  if (status === "rejected") return "bg-[#fef2f2] text-[#dc2626]";
  return "bg-[#eff6ff] text-[#2563eb]";
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-2)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TS";
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
