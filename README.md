# ARWEEN-Nexus

ARWEEN-Nexus is an evidence and liquidity guardrail for small businesses. It reads a supplier invoice, checks the counterparty in public sources, and proposes one of four outcomes before a person decides:

| Outcome | Meaning |
| --- | --- |
| `PAY` | Pay the invoice in full. Debt-service coverage stays at or above 1.25. |
| `PARTIAL` | Pay only the capped amount that still clears 1.25. |
| `HOLD` | Do not pay. A blocking rule failed, or the safe cap is not positive. |
| `INSUFFICIENT` | Required fields are missing, the currency does not match, or extraction confidence is under 80%. |

A person approves or rejects that proposal. The app never moves money. Fault is not assigned (`fault_determination = NOT_PERFORMED`).

The behavior follows ARWEEN-NEXUS-TMS-001 (18 October 2026) for the Nebius x NVIDIA Global AI Hackathon, track Best Apps & Agents.

## Setup

Requirements: Node.js 22 and PostgreSQL 16.

```bash
cp .env.example .env.local
# edit .env.local if your database URL differs
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The default database URL is `postgres://arween:arween@127.0.0.1:5432/arween`. On first boot the app creates the schema, seeds Baan Suan Studio with the spec cash and debt figures, and inserts an anchor invoice `INV-9001` for fictional Vanta Commerce so case C can detect a duplicate.

Docker Compose starts Postgres and the app together:

```bash
docker compose up --build
```

Leave `NEBIUS_API_KEY` and `TAVILY_API_KEY` empty to run the scripted demo. With keys set, the same buttons call the live APIs.

## What works in this build

- Integer DSCR engine (`dscr-integer-v1`) and all seven rules, stored in PostgreSQL.
- Spec cases through the API in demo mode: A `PAY` with DSCR `1.3255`, B `PARTIAL` at `4500000` minor units (45,000.00 THB), C `HOLD` on `RULE-INV-001` with the four blocking failures recorded.
- Upload or paste of labeled text, JSON, and PDF text. Images are transcribed only when a Nebius key is present.
- Three-scenario table, colour verdict, Thai/English toggle, approve/reject, history, and audit log.
- `ModelInvocation` and `RetrievalQuery` rows for every completed review.
- Hallucination check on the explanation. A failed check is stored with `accepted = false`. The explainer retries on `nvidia/nemotron-3-super-120b-a12b`. If that check also fails, the screen shows template text.
- One-click fictional samples. Re-running A or B voids the previous non-anchor copy so the button stays repeatable. The Vanta anchor invoice is never voided.

## What still needs keys or a deploy

- `NEBIUS_API_KEY` is required before any request is sent to Token Factory. Without it, extraction uses a strict labeled parser and the explanation is the deterministic template. The UI says so.
- `TAVILY_API_KEY` is required before any request is sent to Tavily. Without it, the counterparty check is labeled `not verified`, no search result is stored, and `RULE-WEB-001` does not block. Set the key and the same legal-name plus tax-id query calls Tavily.
- With a live Tavily key, a tax ID that does not appear in the results fails `RULE-WEB-001` and the outcome is `HOLD`. That path does not invent a match.
- This environment was not deployed to Nebius. `docker compose up --build` is the deploy path. Point `NEBIUS_BASE_URL` at a dedicated Token Factory endpoint when you create one.
- `gps_verified` exists on `invoices` and is always left null. It does not affect the decision.

## Architecture

```text
upload / sample
  -> file check and Idempotency-Key
  -> extract JSON
       demo: strict labeled parser
       live: PDF/text to Nemotron Nano; images transcribed by Nemotron 3.5 Super VL, then Nano
  -> schema check, confidence gate, minor units
  -> current DebtFacility and CashflowAssumption
  -> three ForecastScenario rows (held, paid_full, partial_max)
  -> counterparty search
       no Tavily key: not verified, no invented hit, name + tax id query stored only
       live: Tavily, name + tax id only
  -> RULE-DATA-001 … RULE-PAY-001
  -> explain
       live: Nemotron 3 Ultra, then the hallucination validator
       otherwise: template from the computed result
  -> PaymentDecision status=proposed, AuditEvent
  -> a person confirms or rejects (no payment)
```

Money, tax, and DSCR are computed in `lib/engine` with `bigint` only. Model prompts tell the extractor to copy printed amounts and tell the explainer not to calculate. The outcome stored on `payment_decisions` comes from `decide()`, never from model text.

## How Nebius Token Factory and Nemotron are used

Catalog checked on 18 October 2026 against `https://tokenfactory.nebius.com/api/public/models_info`.

| Role | Env | Default model id |
| --- | --- | --- |
| Invoice JSON extraction | `NEBIUS_EXTRACT_MODEL` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| Thai and English explanation | `NEBIUS_EXPLAIN_MODEL` | `nvidia/Nemotron-3-Ultra-550b-a55b` |
| Explanation fallback | `NEBIUS_EXPLAIN_FALLBACK_MODEL` | `nvidia/nemotron-3-super-120b-a12b` |
| Image transcription only | `NEBIUS_VISION_MODEL` | `nvidia/Nemotron-3.5-Super-VL` |

Nano is text-only in the catalog, so a photo is transcribed by the vision model and the transcript is then sent to Nano for the JSON. Ultra writes the Thai and English explanation. If that call errors, or the hallucination validator rejects it, the same payload is sent to Nemotron 3 Super.

Calls are OpenAI-compatible:

```text
POST ${NEBIUS_BASE_URL}/chat/completions
Authorization: Bearer ${NEBIUS_API_KEY}
```

Default base URL: `https://api.tokenfactory.nebius.com/v1/`. That is the public Token Factory serverless endpoint. Docs: [https://docs.tokenfactory.nebius.com](https://docs.tokenfactory.nebius.com).

Each call is inserted into `model_invocations` with purpose `extract`, `transcribe`, or `explain`, the model id, latency, and `accepted`. Extraction JSON that fails the schema is `accepted = false` and the review stops as `INSUFFICIENT` without invented amounts. An explanation is `accepted = false` when it cites a rule id that was not evaluated or a number that is not in the computed result (minor units, 2-decimal currency amounts of those units, or a DSCR ratio whose micros value is in the result, including the 1.25 threshold). The stored prose is then the template.

To use a dedicated Nebius serverless endpoint instead of the public pool, create the endpoint in Token Factory for the same model and set `NEBIUS_BASE_URL` to the OpenAI-compatible base URL shown for that endpoint. Dedicated endpoint setup: [https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/quickstart](https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/quickstart).

## How Tavily is used

`POST https://api.tavily.com/search` with `Authorization: Bearer ${TAVILY_API_KEY}`.

The query is built only from the supplier legal name and tax id (`lib/tavily/query.ts`). Invoice totals, cash figures, and other business fields are not included. `tax_id_found` is true only when a returned title, snippet, or URL contains that tax id. Source URLs are shown on the review. The query string is stored on `retrieval_queries` and shown in the evidence section.

If `TAVILY_API_KEY` is empty, the provider is `not_verified`, `tax_id_found` stays false, and the evidence list is empty. The screen says not verified. `RULE-WEB-001` is recorded as a warning so the missing key does not pretend the tax ID was found and does not pretend a search failed. Integer DSCR math and the other six rules are unchanged. A completed Tavily search that misses the tax ID still blocks.

## Rules and integer math

PostgreSQL table `rules` holds the seven rule ids. Every review writes seven `rule_findings`. The winning rule is the first blocking failure in this order:

1. `RULE-DATA-001` — missing fields, currency mismatch, or confidence below 8000 bps → `INSUFFICIENT`
2. `RULE-INV-001` — same invoice number for the same counterparty, not void → `HOLD`
3. `RULE-INV-002` — line totals, VAT, or grand total disagree with the integer formulas → `HOLD`
4. `RULE-WEB-001` — tax id not found in a completed search → `HOLD`. A search that was not run is `not verified` and does not block.
5. `RULE-DSCR-001` — full payment fails 1.25 while debt is due. If `max_payment_minor > 0` the outcome is `PARTIAL` and `partial_amount_minor` equals that cap. Otherwise `HOLD`.
6. `RULE-PRICE-001` — unit price above a reference ceiling. Warn only. It does not change the outcome. The seed ceiling for `Cartons` is 300.00 THB.
7. `RULE-PAY-001` — no blocking rule failed → `PAY`

Shared spec inputs, in minor units (satang):

| Input | Minor | THB |
| --- | --- | --- |
| Cash in | 25000000 | 250,000.00 |
| Operating cash out | 8000000 | 80,000.00 |
| Principal due | 8000000 | 80,000.00 |
| Interest due | 2000000 | 20,000.00 |
| Debt service | 10000000 | 100,000.00 |
| Minimum cash for DSCR 1.25 | 12500000 | 125,000.00 |
| Safe payment cap | 4500000 | 45,000.00 |

`passes_dscr` is `debt_service > 0 AND cash_available * 100 >= debt_service * 125`. `dscr_micros` divides `cash_available * 1000000` by `debt_service`. 1.25 is `1250000`. Case A full payment leaves `13255000` and DSCR `1325500` (`1.3255`).

The 50/50 kickoff split from the spec is implemented and unit-tested. It is not used in the decision, because escrow disbursement is deferred.

## Tests

```bash
npm test
```

`tests/spec-cases.test.ts` locks cases A, B, and C, the confidence gate, a non-positive cap, the price warn, the hallucination validator, the sample parser, and the retrieval query contents.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEBIUS_API_KEY` | Token Factory key. Empty = demo extraction and template explanation |
| `NEBIUS_BASE_URL` | OpenAI-compatible base, no trailing path beyond `/v1` |
| `NEBIUS_EXTRACT_MODEL` | Nano model id |
| `NEBIUS_EXPLAIN_MODEL` | Ultra model id for Thai and English explanations |
| `NEBIUS_EXPLAIN_FALLBACK_MODEL` | Super model id used when Ultra fails the call or the validator |
| `NEBIUS_VISION_MODEL` | Vision model id for images |
| `TAVILY_API_KEY` | Tavily key. Empty = not verified, no invented result |

## Deferred

Phase 2 names from the spec are not implemented: `EscrowVaultLock`, `MilestoneDisbursement`, `IntegritySnapshot`, and `NetworkMembership`. `gps_verified` is deferred. Human confirmation does not create a transfer.

## License

MIT. See [LICENSE](LICENSE).
