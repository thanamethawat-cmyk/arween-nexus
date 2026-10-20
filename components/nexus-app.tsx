"use client";

import { ArrowUp, ClipboardList, History as HistoryIcon, Menu, Search, Settings as SettingsIcon, Upload, Users, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrepareError, prepareUpload, uploadKind, type PrepareCode } from "@/lib/prepare-upload";
import { debtServiceMinor, maxPaymentMinor } from "@/lib/engine/money";
import { formatDscr, formatMinor, majorToMinor, minorToMajorInput } from "@/lib/engine/format";
import { findingText, outcomeLabel, quotaText, rulePurpose, t, type Lang } from "@/lib/i18n";
import { sampleInvoices } from "@/lib/samples";
import type { BootstrapView, DecisionListItem, DecisionView } from "@/lib/view";

type PendingUpload = {
  file: File;
  imageUrl: string | null;
  textPreview: string | null;
  sourceName: string;
};

type AuditRow = {
  auditId: string;
  decisionId: string | null;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
};

type View = "review" | "decisions" | "history" | "parties" | "cash" | "settings";
type BannerError = { code?: string; fallback: string; prepare?: PrepareCode };

function bannerFromPayload(payload: { error?: unknown; code?: unknown }, fallback: string): BannerError {
  return {
    code: typeof payload.code === "string" ? payload.code : undefined,
    fallback: typeof payload.error === "string" && payload.error.trim() ? payload.error.slice(0, 400) : fallback,
  };
}
type SampleId = "A" | "B" | "C";

const NAV: Array<{ id: View; key: "navReview" | "navDecisions" | "navHistory" | "navParties" | "navCash" | "navSettings"; icon: LucideIcon }> = [
  { id: "review", key: "navReview", icon: Upload },
  { id: "decisions", key: "navDecisions", icon: ClipboardList },
  { id: "history", key: "navHistory", icon: HistoryIcon },
  { id: "parties", key: "navParties", icon: Users },
  { id: "cash", key: "navCash", icon: Wallet },
  { id: "settings", key: "navSettings", icon: SettingsIcon },
];

const CARD = "rounded-[25px] bg-[var(--aw-card)] shadow-[0_8px_24px_rgba(45,96,255,0.06)]";

const TONE: Record<DecisionView["outcome"], { badge: string; gradient: string; ring: string; button: string; slice: string }> = {
  PAY: {
    badge: "bg-[#eef0ff] text-[#4C49ED]",
    gradient: "bg-gradient-to-br from-[#4C49ED] to-[#2D60FF]",
    ring: "border-[#4C49ED]",
    button: "bg-[#4C49ED] text-white hover:bg-[#2D60FF]",
    slice: "#4C49ED",
  },
  PARTIAL: {
    badge: "bg-[#e7fbfa] text-[#0f9d97]",
    gradient: "bg-gradient-to-br from-[#2D60FF] to-[#16DBCC]",
    ring: "border-[#16DBCC]",
    button: "bg-[#16DBCC] text-[#102033] hover:bg-[#12c4b6]",
    slice: "#16DBCC",
  },
  HOLD: {
    badge: "bg-[#eceef6] text-[var(--aw-ink)]",
    gradient: "bg-gradient-to-br from-[#343C6A] to-[#1814F3]",
    ring: "border-[#343C6A]",
    button: "bg-[#343C6A] text-white hover:bg-[#1814F3]",
    slice: "#343C6A",
  },
  INSUFFICIENT: {
    badge: "bg-[#f3f2ff] text-[#6d6af2]",
    gradient: "bg-gradient-to-br from-[#8b89f6] to-[#4C49ED]",
    ring: "border-[#8b89f6]",
    button: "bg-[#6d6af2] text-white hover:bg-[#4C49ED]",
    slice: "#8b89f6",
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
  const [historyQuery, setHistoryQuery] = useState("");
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const pendingUrlRef = useRef<string | null>(null);

  function clearPendingUpload() {
    setPendingUpload((current) => {
      if (current?.imageUrl) URL.revokeObjectURL(current.imageUrl);
      return null;
    });
  }

  useEffect(() => {
    pendingUrlRef.current = pendingUpload?.imageUrl ?? null;
  }, [pendingUpload]);

  useEffect(() => () => {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
  }, []);

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
      clearPendingUpload();
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

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    clearPendingUpload();
    try {
      const prepared = await prepareUpload(file);
      const kind = uploadKind(prepared);
      let imageUrl: string | null = null;
      let textPreview: string | null = null;
      if (kind === "image") {
        imageUrl = URL.createObjectURL(prepared);
      } else if (kind === "text") {
        textPreview = (await prepared.text()).slice(0, 1200);
      }
      setPendingUpload({
        file: prepared,
        imageUrl,
        textPreview,
        sourceName: file.name,
      });
    } catch (err) {
      if (err instanceof PrepareError) setError({ fallback: "", prepare: err.code });
      else setError({ fallback: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmUpload() {
    if (!pendingUpload) return;
    const form = new FormData();
    form.set("file", pendingUpload.file);
    form.set("actor", actor);
    await run(form);
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

  const pageTitle = showVerdict && decision
    ? `${decision.invoice.invoiceNumber}`
    : view === "review" ? t(lang, "newReviewTitle")
      : view === "history" ? t(lang, "historyTitle")
        : view === "parties" ? t(lang, "partiesTitle")
          : view === "cash" ? t(lang, "cashTitle")
            : view === "settings" ? t(lang, "settingsTitle")
              : t(lang, "navDecisions");

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--aw-canvas)] text-[var(--aw-ink)]">
      <aside className="hidden h-full w-[250px] shrink-0 flex-col bg-[var(--aw-card)] md:flex">
        <Brand lang={lang} />
        <Nav lang={lang} view={view} onNavigate={go} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-[#343C6A]/30" aria-label={t(lang, "back")} onClick={() => setMenuOpen(false)} />
          <aside className="relative flex h-full w-[250px] flex-col bg-[var(--aw-card)]">
            <Brand lang={lang} />
            <Nav lang={lang} view={view} onNavigate={go} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          lang={lang}
          title={pageTitle}
          view={view}
          query={historyQuery}
          onQuery={setHistoryQuery}
          onMenu={() => setMenuOpen(true)}
          onNavigate={go}
          onLang={setLang}
        />
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 md:px-8">
          {error && (
            <p className="mb-4 rounded-[20px] bg-[#fff1f1] px-4 py-3 text-sm text-[#d32f2f]" role="alert" data-testid="app-error">
              {error.prepare ? t(lang, error.prepare) : quotaText(lang, error.code, error.fallback)}
            </p>
          )}
          {notice && !showVerdict && <p className={`mb-4 px-5 py-3 text-sm text-[var(--aw-muted)] ${CARD}`}>{notice}</p>}

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
              history={history}
              pendingUpload={pendingUpload}
              onDragOver={setDragOver}
              onFile={onFile}
              onConfirmUpload={() => void confirmUpload()}
              onCancelUpload={clearPendingUpload}
              onTogglePaste={() => setShowPaste((value) => !value)}
              onPaste={setPaste}
              onRunPaste={() => {
                clearPendingUpload();
                void run({ text: paste });
              }}
              onSample={(sample) => {
                clearPendingUpload();
                void run({ sample });
              }}
            />
          )}

          {view === "decisions" && !decision && (
            <DecisionList lang={lang} items={history} onOpen={(id) => void openDecision(id)} />
          )}

          {showVerdict && decision && (
            <Verdict
              lang={lang}
              decision={decision}
              rulesOpen={rulesOpen}
              evidenceOpen={evidenceOpen}
              onBack={() => setView("review")}
              onToggleRules={() => setRulesOpen((value) => !value)}
              onToggleEvidence={() => setEvidenceOpen((value) => !value)}
            />
          )}

          {view === "history" && (
            <History
              lang={lang}
              items={history}
              audit={audit}
              query={historyQuery}
              onQuery={setHistoryQuery}
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
    <div className="flex items-center gap-3 px-7 pb-6 pt-8">
      <div className="grid size-10 place-items-center rounded-2xl bg-[#4C49ED] text-base font-semibold text-white">A</div>
      <div className="leading-tight">
        <div className="text-xl font-semibold tracking-tight text-[var(--aw-ink)]">ARWEEN.</div>
        <div className="text-xs text-[var(--aw-muted)]">{t(lang, "brandSub")}</div>
      </div>
    </div>
  );
}

function Nav({ lang, view, onNavigate }: { lang: Lang; view: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            data-testid={`nav-${item.id}`}
            onClick={() => onNavigate(item.id)}
            className={`relative flex w-full items-center gap-4 py-3 pl-8 pr-4 text-left text-[15px] ${active ? "font-medium text-[#4C49ED]" : "text-[var(--aw-faint)] hover:text-[#4C49ED]"}`}
          >
            {active && <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#4C49ED]" />}
            <Icon size={20} strokeWidth={1.75} />
            {t(lang, item.key)}
          </button>
        );
      })}
    </nav>
  );
}

function TopBar({
  lang, title, view, query, onQuery, onMenu, onNavigate, onLang,
}: {
  lang: Lang;
  title: string;
  view: View;
  query: string;
  onQuery: (value: string) => void;
  onMenu: () => void;
  onNavigate: (view: View) => void;
  onLang: (lang: Lang) => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-5 md:gap-6 md:px-8">
      <button className="rounded-xl p-1 text-[var(--aw-ink)] md:hidden" onClick={onMenu} aria-label="Menu">
        <Menu size={22} />
      </button>
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#4C49ED] text-sm font-semibold text-white md:hidden">A</div>
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-[var(--aw-ink)] md:text-[28px]">{title}</h1>
      <div className="ml-auto flex items-center gap-2 md:gap-4">
        <label className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--aw-muted)]" size={16} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") onNavigate("history"); }}
            placeholder={t(lang, "search")}
            className="h-12 w-64 rounded-full bg-[var(--aw-card)] pl-11 pr-4 text-sm text-[var(--aw-ink)] shadow-[0_4px_20px_rgba(45,96,255,0.06)] outline-none placeholder:text-[var(--aw-muted)] lg:w-80"
          />
        </label>
        <button className="grid size-11 place-items-center rounded-full bg-[var(--aw-card)] text-[var(--aw-muted)] shadow-[0_4px_20px_rgba(45,96,255,0.06)] md:hidden" aria-label={t(lang, "search")} onClick={() => onNavigate("history")}>
          <Search size={18} />
        </button>
        <button
          className={`grid size-11 place-items-center rounded-full bg-[var(--aw-card)] shadow-[0_4px_20px_rgba(45,96,255,0.06)] ${view === "settings" ? "text-[#4C49ED]" : "text-[var(--aw-muted)]"}`}
          aria-label={t(lang, "navSettings")}
          onClick={() => onNavigate("settings")}
        >
          <SettingsIcon size={18} />
        </button>
        <ThemeToggle lang={lang} />
        <LangCluster lang={lang} onLang={onLang} />
      </div>
    </header>
  );
}

function LangCluster({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <div className="flex rounded-full bg-[var(--aw-card)] p-1 shadow-[0_4px_20px_rgba(45,96,255,0.06)]">
      {(["th", "en"] as const).map((code) => (
        <button
          key={code}
          data-testid={`lang-${code}`}
          onClick={() => onLang(code)}
          className={`rounded-full px-2.5 py-1.5 text-xs ${lang === code ? "bg-[#4C49ED] font-semibold text-white" : "text-[var(--aw-muted)]"}`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Review({
  lang, currency, preview, busy, dragOver, showPaste, paste, boot, history, pendingUpload, onDragOver, onFile, onConfirmUpload, onCancelUpload, onTogglePaste, onPaste, onRunPaste, onSample,
}: {
  lang: Lang;
  currency: string;
  preview: { inflow: bigint; outflow: bigint; debt: bigint; max: bigint } | null;
  busy: boolean;
  dragOver: boolean;
  showPaste: boolean;
  paste: string;
  boot: BootstrapView | null;
  history: DecisionListItem[];
  pendingUpload: PendingUpload | null;
  onDragOver: (value: boolean) => void;
  onFile: (file: File | undefined) => void;
  onConfirmUpload: () => void;
  onCancelUpload: () => void;
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
  const readyLabel = pendingUpload
    ? t(lang, "previewReady")
        .replace("{name}", pendingUpload.sourceName)
        .replace("{size}", formatBytes(pendingUpload.file.size))
    : "";
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--aw-muted)]">{t(lang, "newReviewSub")}</p>
      {boot?.demo.tavily && <p className="text-sm text-[var(--aw-muted)]">{t(lang, "demoTavily")}</p>}
      {pendingUpload ? (
        <section data-testid="upload-preview" className={`flex flex-col gap-4 p-5 ${CARD}`}>
          <div>
            <h2 className="text-lg font-semibold text-[var(--aw-ink)]">{t(lang, "previewTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--aw-muted)]">
              {pendingUpload.imageUrl ? t(lang, "previewHint") : pendingUpload.textPreview ? t(lang, "previewTextTitle") : t(lang, "previewPdfNote")}
            </p>
            <p className="mt-2 text-xs text-[var(--aw-muted)]">{readyLabel}</p>
          </div>
          {pendingUpload.imageUrl && (
            <div className="overflow-hidden rounded-2xl bg-[var(--aw-inset)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img
                src={pendingUpload.imageUrl}
                alt={pendingUpload.sourceName}
                className="mx-auto max-h-[min(70vh,640px)] w-auto max-w-full object-contain"
              />
            </div>
          )}
          {pendingUpload.textPreview && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-[var(--aw-inset)] p-4 text-xs text-[var(--aw-ink)]">{pendingUpload.textPreview}</pre>
          )}
          {!pendingUpload.imageUrl && !pendingUpload.textPreview && (
            <p className="rounded-2xl bg-[var(--aw-inset)] px-4 py-6 text-sm text-[var(--aw-muted)]">{pendingUpload.file.name}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="upload-cancel"
              disabled={busy}
              onClick={onCancelUpload}
              className="rounded-xl border border-[var(--aw-line-strong)] bg-[var(--aw-card)] px-4 py-2.5 text-sm font-semibold text-[var(--aw-ink)] disabled:opacity-50"
            >
              {t(lang, "previewCancel")}
            </button>
            <button
              type="button"
              data-testid="upload-confirm"
              disabled={busy}
              onClick={onConfirmUpload}
              className="rounded-xl bg-[#4C49ED] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t(lang, "workingShort") : t(lang, "previewConfirm")}
            </button>
          </div>
        </section>
      ) : (
        <label
          data-testid="dropzone"
          onDragOver={(event) => { event.preventDefault(); onDragOver(true); }}
          onDragLeave={() => onDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDragOver(false);
            onFile(event.dataTransfer.files?.[0]);
          }}
          className={`flex h-[220px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed md:h-[280px] ${CARD} ${dragOver ? "border-[#4C49ED]" : "border-[var(--aw-line-strong)]"}`}
        >
          <span className="grid size-14 place-items-center rounded-full bg-[#eef0ff] text-[#4C49ED]"><ArrowUp size={22} /></span>
          <span className="text-lg font-semibold text-[var(--aw-ink)]">{busy ? t(lang, "workingShort") : t(lang, "dropTitle")}</span>
          <span className="text-sm text-[var(--aw-muted)]">{t(lang, "dropHint")}</span>
          <span className="rounded-xl bg-[#4C49ED] px-4 py-2.5 text-sm font-semibold text-white">{t(lang, "browse")}</span>
          <input
            type="file"
            className="sr-only"
            disabled={busy}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.json,application/pdf,text/plain,application/json"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              onFile(chosen);
            }}
          />
        </label>
      )}
      <button className="self-start text-sm text-[var(--aw-muted)] underline-offset-2 hover:underline" onClick={onTogglePaste}>{t(lang, "pasteToggle")}</button>
      {showPaste && (
        <div className={`flex flex-col gap-2 p-5 ${CARD}`}>
          <textarea className="min-h-24 rounded-2xl border border-[var(--aw-line)] bg-[var(--aw-inset)] p-3 text-sm" value={paste} onChange={(event) => onPaste(event.target.value)} />
          <button className="self-start rounded-xl bg-[#4C49ED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !paste.trim()} onClick={onRunPaste}>{t(lang, "runPaste")}</button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className={`p-5 ${CARD}`}>
            <div className="text-xs text-[var(--aw-muted)]">{label}</div>
            <div className="mt-3 text-lg font-semibold tabular-nums text-[var(--aw-ink)]">{value}</div>
          </div>
        ))}
      </div>
      <OutcomeMix lang={lang} items={history} />
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t(lang, "trySample")}</h2>
          <span className="text-[13px] text-[var(--aw-muted)]">{t(lang, "sampleNote")}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {samples.map((sample) => {
            const invoice = sampleInvoices[sample.id];
            return (
              <article key={sample.id} className={`flex flex-col gap-3 p-5 ${CARD}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">{lang === "th" ? `เคส ${sample.id}` : `Case ${sample.id}`}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[sample.outcome].badge}`}>{sample.outcome}</span>
                </div>
                <p className="text-[13px] text-[var(--aw-muted)]">{invoice.invoiceNumber} · {invoice.supplierLegalName}</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--aw-ink)]">{formatMinor(invoice.totalMinor, invoice.currency)}</p>
                <p className="text-xs text-[var(--aw-muted)]">{t(lang, sample.blurb)}</p>
                <button
                  data-testid={`sample-${sample.id}`}
                  disabled={busy}
                  onClick={() => onSample(sample.id)}
                  className="mt-auto w-full rounded-xl border border-[var(--aw-line-strong)] bg-[var(--aw-card)] px-4 py-2.5 text-sm font-semibold text-[#4C49ED] disabled:opacity-50"
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
  if (items.length === 0) return <p className="text-sm text-[var(--aw-muted)]">{t(lang, "historyEmpty")}</p>;
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <button key={item.decisionId} onClick={() => onOpen(item.decisionId)} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left ${CARD}`}>
          <div>
            <div className="font-semibold text-[var(--aw-ink)]">{item.invoiceNumber} · {item.supplierLegalName}</div>
            <div className="mt-1 text-sm text-[var(--aw-muted)]">{formatWhen(item.createdAt, lang)} · {item.winningRuleId}</div>
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
  lang, decision, rulesOpen, evidenceOpen, onBack, onToggleRules, onToggleEvidence,
}: {
  lang: Lang;
  decision: DecisionView;
  rulesOpen: boolean;
  evidenceOpen: boolean;
  onBack: () => void;
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
        <button data-testid="mobile-back" className="text-sm font-medium text-[var(--aw-ink)]" onClick={onBack}>← {decision.invoice.invoiceNumber}</button>
      </div>
      <p className="mb-4 text-sm text-[var(--aw-muted)]">
        {decision.invoice.supplierLegalName} · {t(lang, "uploaded")} {formatWhen(decision.createdAt, lang)} (UTC+7) · {t(lang, "decisionWord")} {shortId(decision.decisionId)} · {t(lang, "statusWord")}: {statusWord(lang, decision.status)}
      </p>

      <section className={`mb-4 rounded-[25px] p-6 text-white shadow-[0_12px_30px_rgba(76,73,237,0.25)] ${tone.gradient}`}>
        <div className="text-sm text-white/80">{t(lang, "decisionWord")}</div>
        <h2 className="mt-2 text-2xl font-semibold md:text-3xl" data-testid="outcome">{headline}</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/85">{detail}</p>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-white/70">{t(lang, "invoiceTotal")}</div>
            <div className="text-2xl font-semibold tabular-nums">{formatMinor(BigInt(decision.invoice.totalMinor), currency)}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-white/70">{decision.invoice.supplierLegalName}</div>
            <div>{decision.winningRuleId}</div>
          </div>
        </div>
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
        <div className={`px-4 py-3 text-sm ${CARD}`}>
          <button className="flex w-full items-center justify-between py-1" onClick={onToggleRules}>
            <span>{t(lang, "ruleChecks")}</span>
            <span className="text-[var(--aw-muted)]">{passCount} {t(lang, "pass").toLowerCase()} · {failCount} {t(lang, "fail").toLowerCase()} ›</span>
          </button>
          <button className="flex w-full items-center justify-between py-1" onClick={onToggleEvidence}>
            <span>{t(lang, "evidenceSources")}</span>
            <span className="text-[var(--aw-muted)]">{sourceCountLabel(lang, decision)} ›</span>
          </button>
          {(rulesOpen || evidenceOpen) && (
            <div className="mt-3 border-t border-[var(--aw-line)] pt-3">
              {rulesOpen && <RuleList lang={lang} decision={decision} />}
              {evidenceOpen && <EvidenceBlock lang={lang} decision={decision} />}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 hidden gap-4 md:grid md:grid-cols-2">
        <InvoicePaper lang={lang} decision={decision} />
        <div className={`p-5 ${CARD}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t(lang, "extracted")}</h3>
            <span className="text-xs text-[var(--aw-muted)]">{modelShort(extractModel(decision))} · {t(lang, "confidence").toLowerCase()} {(decision.invoice.confidenceBps / 100).toFixed(1)}%</span>
          </div>
          <Field label={t(lang, "supplier")} value={decision.invoice.supplierLegalName} />
          <Field label={t(lang, "taxId")} value={decision.invoice.supplierTaxId ?? "—"} />
          <Field label={t(lang, "currencyVat")} value={`${decision.invoice.currency} · ${decision.invoice.vatRateBps} bps`} />
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t(lang, "ruleChecks")}</h3>
          <RuleList lang={lang} decision={decision} />
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t(lang, "sources")} ({sourceName(decision)})</h3>
          <EvidenceBlock lang={lang} decision={decision} />
          <p className="mt-4 text-xs leading-5 text-[var(--aw-muted)]">{lang === "th" ? decision.explanationTh : decision.explanationEn}</p>
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
    <article className={`p-5 ${CARD} ${recommended ? `border-2 ${tone.ring}` : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {recommended && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>{t(lang, "recommended")}</span>}
      </div>
      <p className="mt-3 text-sm text-[var(--aw-muted)]">{t(lang, "paymentLabel")} {formatMinor(BigInt(scenario.decisionPaymentMinor), currency)}</p>
      <p className="mt-3 text-xs text-[var(--aw-muted)]">{t(lang, "cashAfter")}</p>
      <p className="text-xl font-semibold tabular-nums text-[var(--aw-ink)]">{formatMinor(BigInt(scenario.cashAvailableMinor), currency)}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-[var(--aw-muted)]">DSCR {scenario.dscrMicros ? formatDscr(BigInt(scenario.dscrMicros)) : "—"} {t(lang, "vsThreshold")}</span>
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
    <article className={`px-4 py-3 ${CARD} ${recommended ? `border-2 ${tone.ring}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {recommended ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>{t(lang, "recommended")}</span> : <PassFail lang={lang} pass={scenario.passesDscr} />}
      </div>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-lg font-semibold tabular-nums">{formatMinor(BigInt(scenario.cashAvailableMinor), currency)}</span>
        <span className="text-sm text-[var(--aw-muted)]">DSCR {scenario.dscrMicros ? formatDscr(BigInt(scenario.dscrMicros)) : "—"}</span>
      </div>
    </article>
  );
}

function InvoicePaper({ lang, decision }: { lang: Lang; decision: DecisionView }) {
  const currency = decision.invoice.currency;
  const rate = (decision.invoice.vatRateBps / 100).toString();
  return (
    <section className={`p-5 ${CARD}`}>
      <h3 className="mb-3 text-sm font-semibold text-[var(--aw-ink)]">{t(lang, "invoiceDoc")}</h3>
      <div className="rounded-2xl bg-[var(--aw-inset)] p-6 text-sm">
        <p className="font-semibold uppercase">{decision.invoice.supplierLegalName}</p>
        <p className="mt-1 text-xs text-[var(--aw-muted)]">{t(lang, "taxId")} {decision.invoice.supplierTaxId ?? "—"}</p>
        <p className="mt-3 font-semibold">TAX INVOICE {decision.invoice.invoiceNumber}</p>
        <p className="mt-1 text-xs text-[var(--aw-muted)]">{t(lang, "issue")} {decision.invoice.issueDate} · {t(lang, "due")} {decision.invoice.dueDate}</p>
        <div className="mt-4 space-y-2">
          {decision.invoice.lines.map((line) => (
            <div key={line.lineNo} className="flex justify-between gap-3">
              <span>{line.description} ×{formatQty(line.quantityMillis)} @ {moneyOnly(line.unitPriceMinor)}</span>
              <span className="tabular-nums">{moneyOnly(line.lineTotalMinor)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-[var(--aw-line)] pt-3">
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
            <div className="text-xs text-[var(--aw-muted)]">
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
    return <p className="text-xs text-[var(--aw-muted)]">{decision.retrieval?.provider === "not_verified" ? t(lang, "taxNotVerified") : t(lang, "noSources")}</p>;
  }
  return (
    <div className="space-y-1">
      {decision.evidence.map((hit) => (
        <a key={hit.url} href={hit.url} className="block text-xs text-[#2D60FF] hover:underline" target="_blank" rel="noreferrer">
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
    <div className="bg-[var(--aw-card)] px-4 py-3 shadow-[0_-8px_24px_rgba(45,96,255,0.06)] md:px-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className={`text-sm text-[var(--aw-muted)] ${notice ? "" : "hidden md:block"}`}>{notice ?? t(lang, "proposeNote")}</p>
        <button data-testid="approve" disabled={locked} onClick={onConfirm} className={`order-first w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 md:order-last md:w-auto ${tone.button}`}>{approve}</button>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <button data-testid="reject" disabled={locked} onClick={onReject} className="rounded-xl border border-[var(--aw-line-strong)] bg-[var(--aw-card)] px-4 py-2.5 text-sm font-semibold text-[var(--aw-ink)] disabled:opacity-50">{t(lang, "reject")}</button>
          <button data-testid="hold" disabled={busy || decision.status !== "proposed"} onClick={onHold} className="rounded-xl bg-[#343C6A] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t(lang, "hold")}</button>
        </div>
      </div>
    </div>
  );
}

function History({
  lang, items, audit, query, onQuery, onOpen,
}: {
  lang: Lang;
  items: DecisionListItem[];
  audit: AuditRow[];
  query: string;
  onQuery: (value: string) => void;
  onOpen: (id: string) => void;
}) {
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
      <p className="mb-4 text-sm text-[var(--aw-muted)]">{t(lang, "historySub")}</p>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input data-testid="history-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t(lang, "search")} className="h-12 w-full rounded-full bg-[var(--aw-card)] px-4 text-sm shadow-[0_4px_20px_rgba(45,96,255,0.06)] outline-none lg:w-80" />
        <Select value={outcome} onChange={setOutcome} label={t(lang, "outcomeAll")} options={[["all", t(lang, "outcomeAll")], ["PAY", "PAY"], ["PARTIAL", "PARTIAL"], ["HOLD", "HOLD"], ["INSUFFICIENT", "INSUFFICIENT"]]} />
        <Select value={status} onChange={setStatus} label={t(lang, "statusAll")} options={[["all", t(lang, "statusAll")], ["proposed", t(lang, "statusProposed")], ["confirmed", t(lang, "statusConfirmed")], ["rejected", t(lang, "statusRejected")]]} />
        <Select value={range} onChange={setRange} label={t(lang, "date7")} options={[["7", t(lang, "date7")], ["30", t(lang, "date30")], ["all", t(lang, "dateAll")]]} />
        <Select value={rule} onChange={setRule} label={t(lang, "ruleAny")} options={[["all", t(lang, "ruleAny")], ...rules.map((id) => [id, id] as [string, string])]} />
        <button onClick={exportCsv} className="h-12 rounded-full bg-[#4C49ED] px-4 text-sm font-semibold text-white">{t(lang, "exportCsv")}</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        {(["all", "PAY", "PARTIAL", "HOLD", "INSUFFICIENT"] as const).map((key) => (
          <button key={key} onClick={() => setOutcome(key === "all" ? "all" : key)} className={`rounded-full px-3 py-1 ${outcome === key || (key === "all" && outcome === "all") ? "bg-[#4C49ED] text-white" : "bg-[var(--aw-card)] text-[var(--aw-muted)]"}`}>
            {key === "all" ? `${lang === "th" ? "ทั้งหมด" : "All"} ${counts.all}` : `${key} ${counts[key]}`}
          </button>
        ))}
      </div>
      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--aw-muted)]">
            <tr>
              {[t(lang, "colTime"), t(lang, "colInvoice"), t(lang, "colSupplier"), t(lang, "colTotal"), t(lang, "colOutcome"), t(lang, "colRule"), t(lang, "colStatus"), t(lang, "colBy")].map((heading) => (
                <th key={heading} className="px-5 py-4 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-[var(--aw-muted)]">{t(lang, "noMatch")}</td></tr>}
            {filtered.map((item) => (
              <tr key={item.decisionId} data-testid={`row-${item.invoiceNumber}`} onClick={() => setSelected(item.decisionId)} className={`cursor-pointer border-t border-[var(--aw-line)] ${active?.decisionId === item.decisionId ? "bg-[var(--aw-inset)]" : "hover:bg-[var(--aw-hover)]"}`}>
                <td className="px-5 py-4 whitespace-nowrap text-[var(--aw-muted)]">{formatWhen(item.createdAt, lang)}</td>
                <td className="px-5 py-4"><button className="font-medium text-[var(--aw-ink)] underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(item.decisionId); }}>{item.invoiceNumber}</button></td>
                <td className="px-5 py-4">{item.supplierLegalName}</td>
                <td className="px-5 py-4 tabular-nums">{moneyOnly(item.totalMinor)}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[item.outcome].badge}`}>{item.outcome}</span></td>
                <td className="px-5 py-4 text-[var(--aw-muted)]">{item.winningRuleId}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{statusWord(lang, item.status)}</span></td>
                <td className="px-5 py-4">{item.status === "proposed" ? "—" : item.actor || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && (
        <section className={`mt-4 p-5 ${CARD}`}>
          <h3 className="text-sm font-semibold text-[var(--aw-ink)]">{t(lang, "auditTrail")} — {shortId(active.decisionId)} ({active.invoiceNumber})</h3>
          <ul className="mt-3 space-y-2 text-xs text-[var(--aw-ink)]">
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
            {trail.length === 0 && <li className="text-[var(--aw-muted)]">{t(lang, "auditEmpty")}</li>}
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
  if (rows.length === 0) return <div><p className="mb-3 text-sm text-[var(--aw-muted)]">{t(lang, "partiesSub")}</p><p className="text-sm text-[var(--aw-muted)]">{t(lang, "partiesEmpty")}</p></div>;
  return (
    <div>
      <p className="mb-4 text-sm text-[var(--aw-muted)]">{t(lang, "partiesSub")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
      {rows.map(([name, count]) => (
        <article key={name} className={`p-5 ${CARD}`}>
          <h3 className="font-semibold text-[var(--aw-ink)]">{name}</h3>
          <p className="mt-1 text-sm text-[var(--aw-muted)]">{count} {t(lang, "invoices")}</p>
        </article>
      ))}
      </div>
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
      <p className="mb-4 text-sm text-[var(--aw-muted)]">{t(lang, "cashSub")}</p>
      <div className={`grid gap-3 p-5 sm:grid-cols-2 ${CARD}`}>
        {fields.map(([label, value, onChange]) => (
          <label key={label} className="text-xs text-[var(--aw-muted)]">
            {label}
            <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="mt-1 h-11 w-full rounded-xl border border-[var(--aw-line)] bg-[var(--aw-inset)] px-3 text-sm text-[var(--aw-ink)] outline-none" />
          </label>
        ))}
      </div>
      {preview && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className={`p-5 text-sm ${CARD}`}><span className="text-[var(--aw-muted)]">{t(lang, "debtService")}</span><div className="mt-1 font-semibold tabular-nums text-[var(--aw-ink)]">{formatMinor(preview.debt, currency)}</div></div>
          <div className={`p-5 text-sm ${CARD}`}><span className="text-[var(--aw-muted)]">{t(lang, "maxPay")}</span><div className="mt-1 font-semibold tabular-nums text-[var(--aw-ink)]">{formatMinor(preview.max, currency)}</div></div>
        </div>
      )}
      <button disabled={busy} onClick={onSave} className="mt-4 rounded-xl bg-[#4C49ED] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t(lang, "saveAssumptions")}</button>
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
  const auth = useAuth();
  const sessionLabel = !auth
    ? null
    : auth.session.kind === "guest"
      ? (lang === "th" ? "โหมดเดโม ไม่มีบัญชีถูกเก็บ" : "Demo mode. No account is stored.")
      : (lang === "th"
        ? `เข้าสู่ระบบเป็น ${auth.session.name} (${auth.session.email}) บัญชีนี้เป็นเรื่องสมมติ`
        : `Signed in as ${auth.session.name} (${auth.session.email}). This account is fictional.`);
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-[var(--aw-muted)]">{t(lang, "settingsSub")}</p>
      {auth && (
        <div className={`space-y-3 p-5 text-sm ${CARD}`}>
          <h3 className="font-semibold text-[var(--aw-ink)]">{lang === "th" ? "เซสชันจำลอง" : "Simulated session"}</h3>
          <p className="text-[var(--aw-muted)]">{sessionLabel}</p>
          {auth.session.kind === "user" && auth.session.consentAt && (
            <p className="text-[var(--aw-muted)]">{lang === "th" ? "บันทึกความยินยอมเมื่อ" : "Consent stored at"} {auth.session.consentAt}</p>
          )}
          <button type="button" data-testid="auth-signout" onClick={auth.signOut} className="rounded-xl border border-[var(--aw-line-strong)] bg-[var(--aw-card)] px-4 py-2.5 text-sm font-semibold text-[var(--aw-ink)]">
            {auth.session.kind === "guest" ? (lang === "th" ? "ออกจากโหมดเดโม" : "Leave demo mode") : (lang === "th" ? "ออกจากระบบ" : "Sign out")}
          </button>
        </div>
      )}
      <label className={`block p-5 text-xs text-[var(--aw-muted)] ${CARD}`}>
        {t(lang, "actor")}
        <input value={actor} onChange={(event) => onActor(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--aw-line)] bg-[var(--aw-inset)] px-3 text-sm text-[var(--aw-ink)] outline-none" />
      </label>
      {boot && (
        <div className={`p-5 text-sm ${CARD}`}>
          <h3 className="font-semibold text-[var(--aw-ink)]">{t(lang, "modelsLive")}</h3>
          <p className="mt-2 text-[var(--aw-muted)]">extract · {boot.models.extract}</p>
          <p className="text-[var(--aw-muted)]">explain · {boot.models.explain}</p>
          <p className="text-[var(--aw-muted)]">vision · {boot.models.vision}</p>
          <p className="text-[var(--aw-muted)]">{boot.models.baseUrl}</p>
          <p className="mt-3 text-[var(--aw-ink)]">{boot.demo.nebius ? t(lang, "demoNebius") : t(lang, "liveNote")}</p>
          {boot.demo.tavily && <p className="mt-2 text-[var(--aw-ink)]">{t(lang, "demoTavily")}</p>}
        </div>
      )}
      <button disabled={busy} onClick={onReset} className="rounded-xl border border-[var(--aw-line-strong)] bg-[var(--aw-card)] px-4 py-2.5 text-sm font-semibold text-[var(--aw-ink)]">{t(lang, "reset")}</button>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-full bg-[var(--aw-card)] px-4 text-sm text-[var(--aw-ink)] shadow-[0_4px_20px_rgba(45,96,255,0.06)] outline-none">
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-[var(--aw-muted)]">{label}</span>
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
  return <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-xs font-semibold text-[var(--aw-muted)]">{finding.status}</span>;
}

function OutcomeMix({ lang, items }: { lang: Lang; items: DecisionListItem[] }) {
  const keys = ["PAY", "PARTIAL", "HOLD", "INSUFFICIENT"] as const;
  const counts = { PAY: 0, PARTIAL: 0, HOLD: 0, INSUFFICIENT: 0 };
  for (const item of items) counts[item.outcome] += 1;
  const total = items.length;
  const max = Math.max(...keys.map((key) => counts[key]), 1);
  let cursor = 0;
  const stops = keys.map((key) => {
    const start = cursor;
    cursor += total === 0 ? 0 : (counts[key] / total) * 100;
    return `${TONE[key].slice} ${start}% ${cursor}%`;
  });
  const pie = total === 0 ? "conic-gradient(#E6EBF5 0% 100%)" : `conic-gradient(${stops.join(", ")})`;
  return (
    <section className={`p-5 ${CARD}`}>
      <h2 className="text-base font-semibold text-[var(--aw-ink)]">{t(lang, "historyTitle")}</h2>
      <p className="mt-1 text-xs text-[var(--aw-muted)]">{total === 0 ? t(lang, "historyEmpty") : `${total}`}</p>
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-end">
        <div className="grid size-36 place-items-center rounded-full" style={{ background: pie }} aria-hidden="true">
          <div className="grid size-20 place-items-center rounded-full bg-[var(--aw-card)] text-lg font-semibold text-[var(--aw-ink)]">{total}</div>
        </div>
        <div className="flex w-full flex-1 items-end gap-3">
          {keys.map((key) => (
            <div key={key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end">
                <div className="w-full rounded-t-xl" style={{ height: `${total === 0 ? 0 : Math.round((counts[key] / max) * 100)}%`, background: TONE[key].slice }} />
              </div>
              <span className="text-[11px] font-medium text-[var(--aw-muted)]">{key}</span>
              <span className="text-sm font-semibold text-[var(--aw-ink)]">{counts[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
