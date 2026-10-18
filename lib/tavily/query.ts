/** Only the legal name and tax id leave the system. Amounts must never be added here. */
export function buildRetrievalQuery(legalName: string, taxId: string): string {
  const name = legalName.replace(/["\r\n]/g, " ").trim();
  const tax = taxId.replace(/[^\dA-Za-z]/g, "").trim();
  return `"${name}" ${tax}`.trim();
}

export function textContainsTaxId(text: string, taxId: string): boolean {
  const needle = taxId.replace(/\s+/g, "");
  if (!needle) return false;
  return text.replace(/\s+/g, "").includes(needle);
}
