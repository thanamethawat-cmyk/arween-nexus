export function formatMinorPlain(minor: bigint): string {
  return minor.toString();
}

export function formatMinor(minor: bigint, currency: "THB" | "USD" | string): string {
  const neg = minor < 0n;
  const value = neg ? -minor : minor;
  const major = value / 100n;
  const frac = (value % 100n).toString().padStart(2, "0");
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${frac} ${currency}`;
}

/** Four decimal places from micros. 1_325_500 -> 1.3255 */
export function formatDscr(micros: bigint): string {
  const neg = micros < 0n;
  const value = neg ? -micros : micros;
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n).toString().padStart(6, "0").slice(0, 4);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export function minorToMajorInput(minor: bigint): string {
  const neg = minor < 0n;
  const value = neg ? -minor : minor;
  const frac = (value % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${(value / 100n).toString()}.${frac}`;
}

export function majorToMinor(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return BigInt(whole ?? "0") * 100n + BigInt((frac + "00").slice(0, 2));
}
