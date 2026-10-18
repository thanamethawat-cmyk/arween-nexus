import type { RuleId } from "./types";

const RULE_RE = /RULE-[A-Z]+-\d+/g;
const NUMBER_RE = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

export type ExplanationDraft = {
  summaryTh: string;
  summaryEn: string;
  citedRuleIds: string[];
  citedAmountsMinor: bigint[];
};

export type ValidationResult = {
  accepted: boolean;
  reasons: string[];
};

export function validateExplanation(
  draft: ExplanationDraft,
  evaluatedRuleIds: readonly RuleId[],
  allowedAmounts: readonly bigint[],
): ValidationResult {
  const reasons: string[] = [];
  const rules = new Set<string>(evaluatedRuleIds);
  const allowed = new Set(allowedAmounts.map((value) => value.toString()));

  for (const ruleId of draft.citedRuleIds) {
    if (!rules.has(ruleId)) reasons.push(`cited_rule:${ruleId}`);
  }
  for (const amount of draft.citedAmountsMinor) {
    if (!allowed.has(amount.toString())) reasons.push(`cited_amount:${amount.toString()}`);
  }

  for (const summary of [draft.summaryTh, draft.summaryEn]) {
    const codes = summary.match(RULE_RE) ?? [];
    for (const code of codes) {
      if (!rules.has(code)) reasons.push(`prose_rule:${code}`);
    }
    const prose = summary.replace(RULE_RE, " ");
    const numbers = prose.match(NUMBER_RE) ?? [];
    for (const token of numbers) {
      if (!numberAllowed(token, allowed)) reasons.push(`prose_number:${token}`);
    }
  }

  return { accepted: reasons.length === 0, reasons };
}

function numberAllowed(token: string, allowed: Set<string>): boolean {
  const plain = token.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return false;
  const hasDecimal = plain.includes(".");
  const integerPart = plain.split(".")[0] ?? plain;
  if (!hasDecimal && allowed.has(integerPart)) return true;

  const minor = toScaled(plain, 2);
  const micros = toScaled(plain, 6);
  const absInt = integerPart.startsWith("-") ? integerPart.slice(1) : integerPart;
  const wideEnough = hasDecimal || absInt.length >= 3;
  if (wideEnough && minor !== null && allowed.has(minor.toString())) return true;
  if (micros !== null && allowed.has(micros.toString())) return true;
  return false;
}

/** Scale a decimal string to an integer with `scale` digits after the point. Extra zeros are allowed. */
function toScaled(plain: string, scale: number): bigint | null {
  const neg = plain.startsWith("-");
  const body = neg ? plain.slice(1) : plain;
  const [whole, frac = ""] = body.split(".");
  if (!whole || !/^\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) return null;
  if (frac.length > scale && !/^0+$/.test(frac.slice(scale))) return null;
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  const value = BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded || "0");
  return neg ? -value : value;
}
