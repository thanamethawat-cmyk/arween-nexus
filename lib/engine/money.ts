/**
 * dscr-integer-v1
 * All money, tax, and DSCR checks use bigint. The LLM never calls these.
 * div_round_half_up is defined for non-negative n and positive d:
 *   (n + (d / 2)) / d
 */

export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d <= 0n) {
    throw new Error("div_round_half_up divisor must be positive");
  }
  if (n < 0n) {
    throw new Error("div_round_half_up is defined for non-negative amounts");
  }
  return (n + d / 2n) / d;
}

export function lineTotalMinor(quantityMillis: bigint, unitPriceMinor: bigint): bigint {
  return divRoundHalfUp(quantityMillis * unitPriceMinor, 1000n);
}

export function vatMinor(subtotalMinor: bigint, vatRateBps: bigint): bigint {
  return divRoundHalfUp(subtotalMinor * vatRateBps, 10000n);
}

export function debtServiceMinor(principalDueMinor: bigint, interestDueMinor: bigint): bigint {
  return principalDueMinor + interestDueMinor;
}

export function cashAvailableMinor(
  cashInMinor: bigint,
  cashOutOperatingMinor: bigint,
  decisionPaymentMinor: bigint,
): bigint {
  return cashInMinor - cashOutOperatingMinor - decisionPaymentMinor;
}

/** 1.25x threshold without floats: cash * 100 >= debt * 125, and debt must be due. */
export function passesDscr(cashAvailable: bigint, debtService: bigint): boolean {
  return debtService > 0n && cashAvailable * 100n >= debtService * 125n;
}

/** 1.25 is stored as 1_250_000. Null when there is no debt service. */
export function dscrMicros(cashAvailable: bigint, debtService: bigint): bigint | null {
  if (debtService <= 0n) return null;
  return (cashAvailable * 1_000_000n) / debtService;
}

export function minAvailableMinor(debtService: bigint): bigint {
  return (debtService * 125n + 99n) / 100n;
}

export function maxPaymentMinor(
  cashInMinor: bigint,
  cashOutOperatingMinor: bigint,
  debtService: bigint,
): bigint {
  return cashInMinor - cashOutOperatingMinor - minAvailableMinor(debtService);
}

/** FairPay 50/50 split. Deferred from the decision path; kept so the formula stays tested. */
export function splitFiftyFifty(totalMinor: bigint): { kickoffMinor: bigint; finalMinor: bigint } {
  const kickoffMinor = totalMinor / 2n;
  return { kickoffMinor, finalMinor: totalMinor - kickoffMinor };
}

export const DSCR_THRESHOLD_MICROS = 1_250_000n;
export const CONFIDENCE_MIN_BPS = 8000;
