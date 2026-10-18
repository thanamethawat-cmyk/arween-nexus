import { appConfig } from "../env";
import { unverifiedRetrieval, type EvidenceHit } from "./fixtures";
import { buildRetrievalQuery, textContainsTaxId } from "./query";

export class TavilyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type RetrievalResult = {
  provider: "tavily" | "not_verified";
  demoMode: boolean;
  query: string;
  taxIdFound: boolean;
  /** False only when a tax ID was present and Tavily was not called. */
  verified: boolean;
  evidence: EvidenceHit[];
};

export async function retrieveCounterparty(legalName: string, taxId: string | null): Promise<RetrievalResult> {
  const query = buildRetrievalQuery(legalName, taxId ?? "");
  const config = appConfig();
  if (!taxId) {
    return {
      provider: config.tavilyApiKey ? "tavily" : "not_verified",
      demoMode: config.tavilyApiKey.length === 0,
      query,
      taxIdFound: false,
      verified: true,
      evidence: [],
    };
  }
  if (!config.tavilyApiKey) {
    const unverified = unverifiedRetrieval();
    return {
      provider: "not_verified",
      demoMode: true,
      query,
      taxIdFound: unverified.found,
      verified: false,
      evidence: unverified.evidence,
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.tavilyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new TavilyError(`Tavily ${response.status}: ${raw.slice(0, 400)}`, response.status);
  }
  let payload: { results?: Array<{ title?: string; url?: string; content?: string }> };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new TavilyError("Tavily returned a non-JSON body", 502);
  }
  const evidence = (payload.results ?? []).flatMap((result) => {
    if (!result.url) return [];
    const blob = `${result.title ?? ""}\n${result.content ?? ""}\n${result.url}`;
    return [
      {
        title: result.title || result.url,
        url: result.url,
        snippet: (result.content || "").slice(0, 500),
        containsTaxId: textContainsTaxId(blob, taxId),
      },
    ];
  });
  return {
    provider: "tavily",
    demoMode: false,
    query,
    taxIdFound: evidence.some((hit) => hit.containsTaxId),
    verified: true,
    evidence,
  };
}
