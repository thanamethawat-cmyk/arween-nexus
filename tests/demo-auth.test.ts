import { describe, expect, it } from "vitest";
import {
  DEMO_VERIFICATION_CODE,
  GOOGLE_DEMO_USER,
  PDPA_COPY,
  SEEDED_DEMO_USERS,
  acceptConsent,
  canEnterApp,
  findPasswordUser,
  isValidThaiPhone,
  normalizePhone,
  parseSession,
  sessionFromUser,
  validateSignUp,
} from "../lib/demo-auth";

describe("simulated demo accounts", () => {
  it("seeds three fictional users and a published password", () => {
    expect(SEEDED_DEMO_USERS).toHaveLength(3);
    expect(SEEDED_DEMO_USERS.every((user) => user.fictional)).toBe(true);
    const primary = SEEDED_DEMO_USERS.find((user) => user.email === "demo@arween.test");
    expect(primary?.password).toBe("Demo1234");
    expect(findPasswordUser("demo@arween.test", "Demo1234")?.name).toBe("Somsak Demo");
    expect(findPasswordUser("demo@arween.test", "wrong")).toBeNull();
    expect(findPasswordUser("niran.google@arween.test", "")).toBeNull();
    expect(findPasswordUser("new@arween.test", "Demo1234", [{
      ...SEEDED_DEMO_USERS[0],
      id: "usr_new",
      email: "new@arween.test",
      name: "New Person",
    }])?.name).toBe("New Person");
    expect(GOOGLE_DEMO_USER.provider).toBe("google");
    expect(GOOGLE_DEMO_USER.fictional).toBe(true);
  });

  it("accepts +66 mobile numbers and rejects other shapes", () => {
    expect(normalizePhone("081-234-5678")).toBe("+66812345678");
    expect(isValidThaiPhone("+66 81 234 5678")).toBe(true);
    expect(isValidThaiPhone("0912345678")).toBe(true);
    expect(isValidThaiPhone("+6681234567")).toBe(false);
    expect(isValidThaiPhone("+14155552671")).toBe(false);
    expect(isValidThaiPhone("+6621234567")).toBe(false);
  });

  it("checks sign-up fields and shows a fixed demo verification code", () => {
    const taken = SEEDED_DEMO_USERS.map((user) => user.email);
    expect(validateSignUp({ name: "A", email: "new@arween.test", phone: "+66811112222", password: "Demo1234" }, taken)).toBe("name");
    expect(validateSignUp({ name: "New Person", email: "demo@arween.test", phone: "+66811112222", password: "Demo1234" }, taken)).toBe("exists");
    expect(validateSignUp({ name: "New Person", email: "new@arween.test", phone: "12345", password: "Demo1234" }, taken)).toBe("phone");
    expect(validateSignUp({ name: "New Person", email: "new@arween.test", phone: "+66811112222", password: "short" }, taken)).toBe("password");
    expect(validateSignUp({ name: "New Person", email: "new@arween.test", phone: "+66811112222", password: "Demo1234" }, taken)).toBeNull();
    expect(DEMO_VERIFICATION_CODE).toBe("123456");
  });

  it("lets a guest in and holds a signed-in user until consent is stored", () => {
    expect(canEnterApp(null)).toBe(false);
    expect(canEnterApp({ kind: "guest" })).toBe(true);
    const user = SEEDED_DEMO_USERS[0];
    expect(canEnterApp(sessionFromUser(user, null))).toBe(false);
    const consent = acceptConsent(user.email, new Date("2026-10-20T12:00:00.000Z"));
    expect(consent).toEqual({ email: "demo@arween.test", acceptedAt: "2026-10-20T12:00:00.000Z", simulated: true });
    expect(canEnterApp(sessionFromUser(user, consent.acceptedAt))).toBe(true);
    expect(parseSession(JSON.stringify({ kind: "guest" }))).toEqual({ kind: "guest" });
    expect(parseSession("not-json")).toBeNull();
  });

  it("states purpose, data, retention, rights, and contact in both languages", () => {
    for (const lang of ["en", "th"] as const) {
      const text = Object.values(PDPA_COPY[lang]).join(" ");
      expect(text.length).toBeGreaterThan(80);
    }
    expect(PDPA_COPY.en.purpose.startsWith("Purpose:")).toBe(true);
    expect(PDPA_COPY.en.collected.startsWith("Data collected:")).toBe(true);
    expect(PDPA_COPY.en.retention.startsWith("Retention:")).toBe(true);
    expect(PDPA_COPY.en.rights.startsWith("Rights:")).toBe(true);
    expect(PDPA_COPY.en.contact).toContain("privacy@arween.test");
    expect(PDPA_COPY.th.purpose).toContain("วัตถุประสงค์");
    expect(PDPA_COPY.th.collected).toContain("ข้อมูลที่เก็บ");
    expect(PDPA_COPY.th.retention).toContain("ระยะเวลาเก็บ");
    expect(PDPA_COPY.th.rights).toContain("สิทธิ");
    expect(PDPA_COPY.th.contact).toContain("ติดต่อ");
  });
});
