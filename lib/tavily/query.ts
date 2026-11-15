/** Thai tax IDs are 13 digits; 9 rejects years, invoice fragments, and URL punctuation. */
const MIN_TAX_ID_CHARS = 9;

/** Only the legal name and tax id leave the system. Amounts must never be added here. */
export function buildRetrievalQuery(legalName: string, taxId: string): string {
  const name = legalName.replace(/["\r\n]/g, " ").trim();
  const tax = compactTaxToken(taxId);
  return `"${name}" ${tax}`.trim();
}

export function compactTaxToken(value: string): string {
  return value.replace(/[^\dA-Za-z]/g, "");
}

/**
 * A public snippet contains the tax id only when the compact token is long enough
 * to be identifying and is not nested inside a longer number.
 */
export function textContainsTaxId(text: string, taxId: string): boolean {
  const needle = compactTaxToken(taxId);
  if (needle.length < MIN_TAX_ID_CHARS) return false;
  const escaped = [...needle].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^0-9A-Za-z]*");
  return new RegExp(`(?<![0-9A-Za-z])${escaped}(?![0-9A-Za-z])`, "i").test(text);
}
