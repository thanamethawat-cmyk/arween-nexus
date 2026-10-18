export type EvidenceHit = {
  title: string;
  url: string;
  snippet: string;
  containsTaxId: boolean;
};

/** A missing Tavily key returns no hits. Nothing here claims a tax ID was found. */
export function unverifiedRetrieval(): { found: false; evidence: EvidenceHit[] } {
  return { found: false, evidence: [] };
}
