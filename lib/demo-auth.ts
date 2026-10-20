export const DEMO_VERIFICATION_CODE = "123456";
export const SESSION_KEY = "arween-session";
export const LOCAL_USERS_KEY = "arween-local-users";
export const CONSENT_KEY = "arween-consents";

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  fictional: true;
  provider: "password" | "google";
};

/** Fictional accounts. Passwords live in the repo because the sign-in is simulated. */
export const SEEDED_DEMO_USERS: readonly DemoUser[] = [
  {
    id: "usr_demo",
    name: "Somsak Demo",
    email: "demo@arween.test",
    phone: "+66812345678",
    password: "Demo1234",
    fictional: true,
    provider: "password",
  },
  {
    id: "usr_mali",
    name: "Mali Fictional",
    email: "mali@arween.test",
    phone: "+66819876543",
    password: "Demo1234",
    fictional: true,
    provider: "password",
  },
  {
    id: "usr_anan",
    name: "Anan Example",
    email: "anan@arween.test",
    phone: "+66912345678",
    password: "Demo1234",
    fictional: true,
    provider: "password",
  },
];

export const GOOGLE_DEMO_USER: DemoUser = {
  id: "usr_google",
  name: "Niran Google",
  email: "niran.google@arween.test",
  phone: "+66800000001",
  password: "",
  fictional: true,
  provider: "google",
};

export type Session =
  | { kind: "guest" }
  | {
      kind: "user";
      email: string;
      name: string;
      provider: "password" | "google";
      fictional: true;
      consentAt: string | null;
    };

export type ConsentRecord = {
  email: string;
  acceptedAt: string;
  simulated: true;
};

export type SignUpInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

export function normalizePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (compact.startsWith("+66")) return compact;
  if (compact.startsWith("66")) return `+${compact}`;
  if (compact.startsWith("0")) return `+66${compact.slice(1)}`;
  return compact;
}

/** Thai mobile numbers: +66 then 6, 8, or 9 and eight more digits. Local 0-prefix is accepted. */
export function isValidThaiPhone(raw: string): boolean {
  return /^\+66[689]\d{8}$/.test(normalizePhone(raw));
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function isValidPassword(raw: string): boolean {
  return raw.length >= 8;
}

export type SignUpError = "name" | "email" | "exists" | "phone" | "password";

export function validateSignUp(input: SignUpInput, existingEmails: readonly string[]): SignUpError | null {
  if (input.name.trim().length < 2) return "name";
  if (!isValidEmail(input.email)) return "email";
  if (existingEmails.some((email) => email.toLowerCase() === input.email.trim().toLowerCase())) return "exists";
  if (!isValidThaiPhone(input.phone)) return "phone";
  if (!isValidPassword(input.password)) return "password";
  return null;
}

export function findPasswordUser(email: string, password: string, extra: readonly DemoUser[] = []): DemoUser | null {
  const match = [...SEEDED_DEMO_USERS, ...extra].find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
  if (!match || match.provider !== "password" || match.password !== password) return null;
  return match;
}

export function acceptConsent(email: string, now = new Date()): ConsentRecord {
  return { email: email.trim().toLowerCase(), acceptedAt: now.toISOString(), simulated: true };
}

export function sessionFromUser(user: DemoUser, consentAt: string | null): Session {
  return {
    kind: "user",
    email: user.email.toLowerCase(),
    name: user.name,
    provider: user.provider,
    fictional: true,
    consentAt,
  };
}

export function canEnterApp(session: Session | null): boolean {
  if (!session) return false;
  if (session.kind === "guest") return true;
  return typeof session.consentAt === "string" && session.consentAt.length > 0;
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Session;
    if (value.kind === "guest") return { kind: "guest" };
    if (value.kind === "user" && value.fictional === true && typeof value.email === "string" && typeof value.name === "string") {
      return {
        kind: "user",
        email: value.email,
        name: value.name,
        provider: value.provider === "google" ? "google" : "password",
        fictional: true,
        consentAt: typeof value.consentAt === "string" ? value.consentAt : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export const PDPA_COPY = {
  en: {
    title: "PDPA consent (simulated)",
    intro: "This consent is simulated. It is stored only in this browser. No account is created on a server, and no message is sent.",
    purpose: "Purpose: to show a consent step before a simulated signed-in demo. The invoice review does not require an account.",
    collected: "Data collected: the name, email, Thai phone number, and password you type, plus the time you accept. A guest demo stores none of these.",
    retention: "Retention: the simulated record stays in this browser until you sign out or clear site data. It is not kept on the server.",
    rights: "Rights: you can refuse, use the app as a guest, sign out, or clear this browser’s site data. Those actions delete the simulated record on this device.",
    contact: "Contact: privacy@arween.test. That address is fictional and is not monitored.",
    checkbox: "I understand this is a simulated consent and I accept it for this demo.",
    accept: "Accept and enter",
  },
  th: {
    title: "ความยินยอม PDPA (จำลอง)",
    intro: "ความยินยอมนี้เป็นการจำลอง เก็บไว้ในเบราว์เซอร์นี้เท่านั้น ไม่มีการสร้างบัญชีบนเซิร์ฟเวอร์ และไม่มีการส่งข้อความ",
    purpose: "วัตถุประสงค์: เพื่อแสดงขั้นตอนความยินยอมก่อนเข้าโหมดเดโมที่จำลองว่าลงชื่อเข้าใช้ การตรวจบิลไม่ต้องมีบัญชี",
    collected: "ข้อมูลที่เก็บ: ชื่อ อีเมล เบอร์โทรไทย และรหัสผ่านที่คุณพิมพ์ รวมถึงเวลาที่กดยอมรับ โหมดผู้เยี่ยมชมไม่เก็บข้อมูลเหล่านี้",
    retention: "ระยะเวลาเก็บ: ข้อมูลจำลองอยู่เฉพาะในเบราว์เซอร์นี้จนกว่าคุณจะออกจากระบบหรือลบข้อมูลเว็บไซต์ ไม่ได้เก็บบนเซิร์ฟเวอร์",
    rights: "สิทธิ: คุณปฏิเสธได้ ใช้แอปแบบผู้เยี่ยมชมได้ ออกจากระบบได้ หรือลบข้อมูลเว็บไซต์ในเบราว์เซอร์นี้ การทำเช่นนั้นจะลบข้อมูลจำลองบนอุปกรณ์นี้",
    contact: "ติดต่อ: privacy@arween.test ที่อยู่นี้เป็นเรื่องสมมติ และไม่มีคนอ่านจดหมาย",
    checkbox: "ฉันเข้าใจว่านี่เป็นความยินยอมจำลอง และยอมรับเพื่อเดโมนี้",
    accept: "ยอมรับและเข้าแอป",
  },
} as const;
