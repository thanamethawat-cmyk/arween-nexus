"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NexusApp } from "@/components/nexus-app";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthContext } from "@/components/auth-context";
import {
  CONSENT_KEY,
  DEMO_VERIFICATION_CODE,
  GOOGLE_DEMO_USER,
  LOCAL_USERS_KEY,
  PDPA_COPY,
  SEEDED_DEMO_USERS,
  SESSION_KEY,
  acceptConsent,
  canEnterApp,
  findPasswordUser,
  normalizePhone,
  parseSession,
  sessionFromUser,
  validateSignUp,
  type ConsentRecord,
  type DemoUser,
  type Session,
} from "@/lib/demo-auth";
import type { Lang } from "@/lib/i18n";

type FormScreen = "login" | "signup" | "verify";

const COPY = {
  en: {
    kicker: "Simulated",
    banner: "Simulated sign-in. No Google account is used. No email or SMS is sent. The invoice review does not require an account.",
    loginTitle: "Sign in",
    skip: "Try without signing up (Demo mode)",
    google: "Continue with Google",
    googleNote: "Simulated. Signs in as Niran Google, a fictional demo user.",
    email: "Email",
    password: "Password",
    submit: "Sign in with email",
    signupLink: "Create a simulated account",
    haveAccount: "Already have a simulated account",
    demoHeading: "Fictional demo users",
    demoHint: "These people are not real. The password is printed here because this sign-in is simulated.",
    demoButton: "Login as demo user",
    fictional: "Fictional",
    badLogin: "That email and password do not match a simulated account.",
    signupTitle: "Create a simulated account",
    name: "Name",
    phone: "Phone (+66)",
    continue: "Continue",
    errors: {
      name: "Enter a name of at least 2 characters.",
      email: "Enter an email address.",
      exists: "That email is already a simulated account.",
      phone: "Use a Thai mobile number, for example +66812345678 or 0812345678.",
      password: "Use at least 8 characters.",
    },
    verifyTitle: "Verify email and phone (simulated)",
    verifyBody: "Nothing was sent to your email or phone. Type the code shown on this screen.",
    codeLabel: "Verification code",
    codeShown: `Demo code: ${DEMO_VERIFICATION_CODE}`,
    badCode: "That code does not match the demo code on this screen.",
    confirm: "Confirm code",
    back: "Back",
    guestInstead: "Try without signing up (Demo mode)",
  },
  th: {
    kicker: "จำลอง",
    banner: "การลงชื่อเข้าใช้เป็นการจำลอง ไม่ได้ใช้บัญชี Google ไม่ส่งอีเมลหรือ SMS การตรวจบิลไม่ต้องมีบัญชี",
    loginTitle: "เข้าสู่ระบบ",
    skip: "ลองใช้โดยไม่สมัคร (โหมดเดโม)",
    google: "ดำเนินการต่อด้วย Google",
    googleNote: "จำลอง เข้าเป็นนิรัน กูเกิล ซึ่งเป็นผู้ใช้เดโมสมมติ",
    email: "อีเมล",
    password: "รหัสผ่าน",
    submit: "เข้าสู่ระบบด้วยอีเมล",
    signupLink: "สร้างบัญชีจำลอง",
    haveAccount: "มีบัญชีจำลองอยู่แล้ว",
    demoHeading: "ผู้ใช้เดโมสมมติ",
    demoHint: "บุคคลเหล่านี้ไม่มีตัวตนจริง รหัสผ่านแสดงไว้เพราะการเข้าสู่ระบบเป็นการจำลอง",
    demoButton: "เข้าสู่ระบบเป็นผู้ใช้เดโม",
    fictional: "สมมติ",
    badLogin: "อีเมลหรือรหัสผ่านไม่ตรงกับบัญชีจำลอง",
    signupTitle: "สร้างบัญชีจำลอง",
    name: "ชื่อ",
    phone: "โทรศัพท์ (+66)",
    continue: "ต่อไป",
    errors: {
      name: "ใส่ชื่ออย่างน้อย 2 ตัวอักษร",
      email: "ใส่อีเมล",
      exists: "อีเมลนี้เป็นบัญชีจำลองอยู่แล้ว",
      phone: "ใช้เบอร์มือถือไทย เช่น +66812345678 หรือ 0812345678",
      password: "ใช้อย่างน้อย 8 ตัวอักษร",
    },
    verifyTitle: "ยืนยันอีเมลและโทรศัพท์ (จำลอง)",
    verifyBody: "ไม่มีการส่งข้อความไปที่อีเมลหรือโทรศัพท์ พิมพ์รหัสที่แสดงบนหน้านี้",
    codeLabel: "รหัสยืนยัน",
    codeShown: `Demo code: ${DEMO_VERIFICATION_CODE}`,
    badCode: "รหัสไม่ตรงกับรหัสเดโมบนหน้านี้",
    confirm: "ยืนยันรหัส",
    back: "กลับ",
    guestInstead: "ลองใช้โดยไม่สมัคร (โหมดเดโม)",
  },
} as const;

export function AuthGate() {
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [screen, setScreen] = useState<FormScreen>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [localUsers, setLocalUsers] = useState<DemoUser[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<DemoUser | null>(null);

  useEffect(() => {
    const storedLang = window.localStorage.getItem("arween-lang");
    if (storedLang === "en" || storedLang === "th") setLang(storedLang);
    setLocalUsers(readUsers());
    setConsents(readConsents());
    setSession(parseSession(window.localStorage.getItem(SESSION_KEY)));
    setReady(true);
  }, []);

  function chooseLang(next: Lang) {
    setLang(next);
    document.documentElement.lang = next;
    window.localStorage.setItem("arween-lang", next);
  }

  function enterGuest() {
    const next: Session = { kind: "guest" };
    setSession(next);
    writeSession(next);
    setFormError(null);
    setScreen("login");
  }

  function enterAs(user: DemoUser, known = consents) {
    const consentAt = known.find((row) => row.email === user.email.toLowerCase())?.acceptedAt ?? null;
    const next = sessionFromUser(user, consentAt);
    setSession(next);
    writeSession(next);
    setFormError(null);
    setAgreed(Boolean(consentAt));
    setScreen("login");
  }

  function signOut() {
    setSession(null);
    writeSession(null);
    setPending(null);
    setFormError(null);
    setScreen("login");
    const storedLang = window.localStorage.getItem("arween-lang");
    if (storedLang === "en" || storedLang === "th") setLang(storedLang);
  }

  function onLogin(event: FormEvent) {
    event.preventDefault();
    const user = findPasswordUser(email, password, localUsers);
    if (!user) {
      setFormError(COPY[lang].badLogin);
      return;
    }
    enterAs(user);
  }

  function onSignUp(event: FormEvent) {
    event.preventDefault();
    const taken = [...SEEDED_DEMO_USERS, ...localUsers].map((user) => user.email);
    const problem = validateSignUp({ name, email, phone, password }, taken);
    if (problem) {
      setFormError(COPY[lang].errors[problem]);
      return;
    }
    setPending({
      id: `usr_${crypto.randomUUID()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: normalizePhone(phone),
      password,
      fictional: true,
      provider: "password",
    });
    setCode("");
    setFormError(null);
    setScreen("verify");
  }

  function onVerify(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    if (code.trim() !== DEMO_VERIFICATION_CODE) {
      setFormError(COPY[lang].badCode);
      return;
    }
    const nextUsers = [...localUsers, pending];
    setLocalUsers(nextUsers);
    writeUsers(nextUsers);
    setFormError(null);
    enterAs(pending);
  }

  function onAccept() {
    if (!agreed || session?.kind !== "user") return;
    const record = acceptConsent(session.email);
    const nextRecords = [...consents.filter((row) => row.email !== record.email), record];
    setConsents(nextRecords);
    writeConsents(nextRecords);
    const next: Session = { ...session, consentAt: record.acceptedAt };
    setSession(next);
    writeSession(next);
  }

  const copy = COPY[lang];
  const stage = !ready ? "boot" : canEnterApp(session) ? "app" : session?.kind === "user" ? "consent" : screen;

  if (stage === "boot") {
    return <div className="min-h-screen bg-[var(--aw-canvas)]" />;
  }

  if (stage === "app" && session) {
    return (
      <AuthContext.Provider value={{ session, signOut }}>
        <NexusApp />
      </AuthContext.Provider>
    );
  }

  return (
    <div className="min-h-screen overflow-auto bg-[var(--aw-canvas)] px-4 py-8 text-[var(--aw-ink)]">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#4C49ED] text-base font-semibold text-white">A</div>
            <div className="leading-tight">
              <div className="text-xl font-semibold tracking-tight">ARWEEN.</div>
              <div className="text-xs text-[var(--aw-muted)]">{copy.kicker}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle lang={lang} />
            <div className="flex rounded-full bg-[var(--aw-card)] p-1 shadow-[0_4px_20px_rgba(45,96,255,0.06)]">
            {(["th", "en"] as const).map((codeName) => (
              <button
                key={codeName}
                type="button"
                data-testid={`lang-${codeName}`}
                onClick={() => chooseLang(codeName)}
                className={`rounded-full px-2.5 py-1.5 text-xs ${lang === codeName ? "bg-[#4C49ED] font-semibold text-white" : "text-[var(--aw-muted)]"}`}
              >
                {codeName.toUpperCase()}
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="rounded-[25px] bg-[var(--aw-card)] p-6 shadow-[0_8px_24px_rgba(45,96,255,0.06)] sm:p-8">
          <p className="rounded-2xl bg-[var(--aw-inset)] px-4 py-3 text-sm text-[var(--aw-muted)]">{copy.banner}</p>

          {stage === "login" && (
            <div className="mt-5 space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight">{copy.loginTitle}</h1>
              <button type="button" data-testid="auth-skip" onClick={enterGuest} className="w-full rounded-2xl bg-[#16DBCC] px-4 py-4 text-base font-semibold text-[#102033]">
                {copy.skip}
              </button>
              <button type="button" data-testid="auth-google" onClick={() => enterAs(GOOGLE_DEMO_USER)} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--aw-line)] bg-[var(--aw-card)] px-4 py-3 text-sm font-semibold">
                <span className="grid size-7 place-items-center rounded-full bg-[var(--aw-inset)] text-sm font-bold text-[#4C49ED]">G</span>
                {copy.google}
              </button>
              <p className="text-xs text-[var(--aw-muted)]">{copy.googleNote}</p>
              <form onSubmit={onLogin} className="space-y-3">
                <Field label={copy.email} id="auth-email" type="email" value={email} onChange={setEmail} autoComplete="username" />
                <Field label={copy.password} id="auth-password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                {formError && <p className="text-sm text-[#d32f2f]" role="alert" data-testid="auth-error">{formError}</p>}
                <button type="submit" data-testid="auth-submit" className="w-full rounded-2xl bg-[#4C49ED] px-4 py-3 text-sm font-semibold text-white">
                  {copy.submit}
                </button>
              </form>
              <button type="button" data-testid="auth-signup" onClick={() => { setFormError(null); setScreen("signup"); }} className="text-sm font-semibold text-[#4C49ED]">
                {copy.signupLink}
              </button>
              <div className="border-t border-[var(--aw-line)] pt-4">
                <h2 className="text-sm font-semibold">{copy.demoHeading}</h2>
                <p className="mt-1 text-xs text-[var(--aw-muted)]">{copy.demoHint}</p>
                <ul className="mt-3 space-y-3">
                  {SEEDED_DEMO_USERS.map((user) => (
                    <li key={user.id} className="rounded-2xl bg-[var(--aw-inset)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{user.name}</p>
                          <p className="text-xs text-[var(--aw-muted)]">{user.email}</p>
                          <p className="text-xs text-[var(--aw-muted)]">{user.phone} · {copy.password}: {user.password}</p>
                        </div>
                        <span className="rounded-full bg-[var(--aw-card)] px-2 py-1 text-[11px] font-semibold text-[#4C49ED]">{copy.fictional}</span>
                      </div>
                      <button type="button" data-testid={`auth-demo-${user.id}`} onClick={() => enterAs(user)} className="mt-3 w-full rounded-xl bg-[var(--aw-card)] px-3 py-2 text-sm font-semibold text-[var(--aw-ink)]">
                        {copy.demoButton}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {stage === "signup" && (
            <form onSubmit={onSignUp} className="mt-5 space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight">{copy.signupTitle}</h1>
              <Field label={copy.name} id="auth-name" value={name} onChange={setName} autoComplete="name" />
              <Field label={copy.email} id="auth-email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label={copy.phone} id="auth-phone" type="tel" value={phone} onChange={setPhone} autoComplete="tel" placeholder="+66 81 234 5678" />
              <Field label={copy.password} id="auth-password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
              {formError && <p className="text-sm text-[#d32f2f]" role="alert" data-testid="auth-error">{formError}</p>}
              <button type="submit" data-testid="auth-submit" className="w-full rounded-2xl bg-[#4C49ED] px-4 py-3 text-sm font-semibold text-white">
                {copy.continue}
              </button>
              <button type="button" onClick={() => { setFormError(null); setScreen("login"); }} className="text-sm font-semibold text-[#4C49ED]">
                {copy.haveAccount}
              </button>
              <button type="button" data-testid="auth-skip" onClick={enterGuest} className="w-full rounded-2xl bg-[#16DBCC] px-4 py-3 text-sm font-semibold text-[#102033]">
                {copy.guestInstead}
              </button>
            </form>
          )}

          {stage === "verify" && pending && (
            <form onSubmit={onVerify} className="mt-5 space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight">{copy.verifyTitle}</h1>
              <p className="text-sm text-[var(--aw-muted)]">{copy.verifyBody}</p>
              <p className="text-sm text-[var(--aw-muted)]">{pending.email} · {pending.phone}</p>
              <p className="rounded-2xl bg-[#eef0ff] px-4 py-3 text-base font-semibold text-[#4C49ED]" data-testid="auth-demo-code">{copy.codeShown}</p>
              <Field label={copy.codeLabel} id="auth-code" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" />
              {formError && <p className="text-sm text-[#d32f2f]" role="alert" data-testid="auth-error">{formError}</p>}
              <button type="submit" data-testid="auth-verify" className="w-full rounded-2xl bg-[#4C49ED] px-4 py-3 text-sm font-semibold text-white">
                {copy.confirm}
              </button>
              <button type="button" onClick={() => { setFormError(null); setScreen("signup"); }} className="text-sm font-semibold text-[#4C49ED]">
                {copy.back}
              </button>
            </form>
          )}

          {stage === "consent" && session?.kind === "user" && (
            <div className="mt-5 space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight">{PDPA_COPY[lang].title}</h1>
              <p className="text-sm text-[var(--aw-muted)]">{session.name} · {session.email} · {copy.fictional}</p>
              <p className="text-sm">{PDPA_COPY[lang].intro}</p>
              <p className="text-sm">{PDPA_COPY[lang].purpose}</p>
              <p className="text-sm">{PDPA_COPY[lang].collected}</p>
              <p className="text-sm">{PDPA_COPY[lang].retention}</p>
              <p className="text-sm">{PDPA_COPY[lang].rights}</p>
              <p className="text-sm">{PDPA_COPY[lang].contact}</p>
              <label className="flex items-start gap-3 rounded-2xl bg-[var(--aw-inset)] p-3 text-sm">
                <input
                  data-testid="auth-consent"
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-1 size-4"
                />
                <span>{PDPA_COPY[lang].checkbox}</span>
              </label>
              <button type="button" data-testid="auth-accept" disabled={!agreed} onClick={onAccept} className="w-full rounded-2xl bg-[#4C49ED] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {PDPA_COPY[lang].accept}
              </button>
              <button type="button" data-testid="auth-skip" onClick={enterGuest} className="w-full rounded-2xl bg-[#16DBCC] px-4 py-3 text-sm font-semibold text-[#102033]">
                {copy.guestInstead}
              </button>
              <button type="button" onClick={signOut} className="text-sm font-semibold text-[#4C49ED]">
                {copy.back}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  id, label, value, onChange, type = "text", autoComplete, placeholder, inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block text-xs text-[var(--aw-muted)]" htmlFor={id}>
      {label}
      <input
        id={id}
        data-testid={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-[var(--aw-line)] bg-[var(--aw-inset)] px-3 text-sm text-[var(--aw-ink)] outline-none"
      />
    </label>
  );
}

function writeSession(session: Session | null) {
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_KEY);
      document.cookie = "arween-demo=; Path=/; Max-Age=0; SameSite=Lax";
      return;
    }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    document.cookie = `arween-demo=${session.kind}; Path=/; Max-Age=2592000; SameSite=Lax`;
  } catch {
    // Private mode can block storage. The in-memory session still opens the demo.
  }
}

function writeUsers(users: DemoUser[]) {
  try {
    window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // The account still exists for this tab.
  }
}

function writeConsents(records: ConsentRecord[]) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(records));
  } catch {
    // The timestamp still lives on the in-memory session.
  }
}

function readUsers(): DemoUser[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as DemoUser[];
    if (!Array.isArray(value)) return [];
    return value.filter((user) => user?.fictional === true && user.provider === "password" && typeof user.email === "string" && typeof user.password === "string");
  } catch {
    return [];
  }
}

function readConsents(): ConsentRecord[] {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as ConsentRecord[];
    if (!Array.isArray(value)) return [];
    return value.filter((row) => row?.simulated === true && typeof row.email === "string" && typeof row.acceptedAt === "string");
  } catch {
    return [];
  }
}
