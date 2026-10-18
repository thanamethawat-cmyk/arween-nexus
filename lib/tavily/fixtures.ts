export type EvidenceHit = {
  title: string;
  url: string;
  snippet: string;
  containsTaxId: boolean;
};

export const DEMO_TAX_HITS: Record<string, EvidenceHit[]> = {
  "0105560000001": [
    {
      title: "Demo registry card — Harbor Supplies Co., Ltd.",
      url: "/demo-evidence/0105560000001",
      snippet:
        "Fictional hackathon fixture. Legal name Harbor Supplies Co., Ltd. Tax ID 0105560000001. This card is not a live web result.",
      containsTaxId: true,
    },
  ],
};

export function demoRetrieval(taxId: string | null): { found: boolean; evidence: EvidenceHit[] } {
  if (!taxId) return { found: false, evidence: [] };
  const evidence = DEMO_TAX_HITS[taxId] ?? [];
  return { found: evidence.some((hit) => hit.containsTaxId), evidence };
}
