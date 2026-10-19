# Devpost submission — ARWEEN-Nexus

Paste-ready text for the Nebius x NVIDIA Global AI Hackathon form. Official requirements: [hackathon rules](https://nebiusglobalaihackathon.devpost.com/rules).

## Project name

ARWEEN-Nexus

## Tagline

Check the invoice, the supplier, and the cash before a small business pays.

## Track

Best Apps & Agents only. This is the only track for this submission.

## Built with

- Next.js
- React
- TypeScript
- PostgreSQL
- Tailwind CSS
- Nebius Token Factory
- NVIDIA Nemotron 3 Nano
- NVIDIA Nemotron 3 Ultra
- NVIDIA Nemotron 3 Super
- NVIDIA Nemotron 3.5 Super VL
- Tavily (optional, off unless `TAVILY_API_KEY` is set)

## Links to put on the form

| Field | Value |
| --- | --- |
| Demo URL | https://arween-nexus.vercel.app |
| Code | https://github.com/thanamethawat-cmyk/arween-nexus |
| License | MIT (`LICENSE` at the repository root) |
| Track | Best Apps & Agents only |
| Video | Record from [docs/VIDEO_SCRIPT.md](VIDEO_SCRIPT.md). Upload a public YouTube video under 3:00. No copyrighted music. |
| Feedback | Paste [docs/FEEDBACK.md](FEEDBACK.md). |

The demo is on Vercel Hobby and Neon Free. Inference is Nebius Token Factory. No login. Free for judges through the judging period.

## What to Submit checklist

Checked against the rules page on 18 October 2026.

| Requirement | Where it is |
| --- | --- |
| Working app on Token Factory or Nebius AI Cloud, using an NVIDIA open model | Live Token Factory calls to Nemotron Nano and Ultra. README section “How we use NVIDIA Nemotron on Nebius Token Factory”. |
| Best Apps & Agents | The only track for this submission. Nano does the fast extract. Ultra does the explanation. Super is the fallback. |
| URL of a working demo | https://arween-nexus.vercel.app |
| Text description of features | The description below, and the README. |
| Public code repository with source, assets, and run instructions | GitHub link above. README setup covers local, Docker Compose, and Vercel/Neon. |
| Open source license visible in the repo | MIT, `LICENSE`. |
| README highlights Nemotron and how Token Factory accelerated the workflow | README section with model ids, the OpenAI-compatible endpoint, and measured latency and tokens. |
| Demonstration video under 3 minutes, YouTube, no copyrighted music, shows the project running | Script only. The entrant still records and uploads it. |
| Track identified | Best Apps & Agents only. |
| Feedback on Token Factory and NVIDIA tools actually used | [FEEDBACK.md](FEEDBACK.md). |
| If the project existed before 26 August 2026, explain the update | It did not. Only the concept and spec existed. All code was written during the submission period. See the README note. |
| Materials in English | README, this file, feedback, and the video script are English. The app also has a Thai UI for the reviewer. |
| Free access for judges until judging ends | Public URL, no account. |

Best Use of Tavily is not claimed. The recorded runs had no Tavily key, so the counterparty check is `not verified` and no search result was invented.

## Description

### Inspiration

A small business can lose a loan covenant by paying one supplier bill in full. The invoice, the supplier’s tax id, and next month’s cash usually sit in different tools. A chatbot that “checks the bill” will often invent a number that looks precise. We wanted a reviewer to see a proposal — pay, pay only up to a cap, hold, or ask for a better document — with the math done in integers and the prose tied to that math.

The setting is a Thai SME. The reviewer should be able to read the result in Thai or English. The app must not move money.

### What it does

ARWEEN-Nexus reads a supplier invoice and proposes one outcome:

- **PAY** — paying in full still leaves a debt-service coverage ratio of at least 1.25.
- **PARTIAL** — full payment would break 1.25, and a positive cap still clears it. The cap is the most that can be paid.
- **HOLD** — a blocking rule failed, or the safe cap is not positive.
- **INSUFFICIENT** — required fields are missing, the currency does not match, or extraction confidence is under 80%.

The reviewer can upload a PDF, image, or text file, or run three fictional samples:

- **A.** Harbor Supplies INV-1044, 37,450.00 THB. Expect PAY and DSCR 1.3255.
- **B.** Harbor Supplies INV-2208, 60,000.00 THB. Expect PARTIAL, pay up to 45,000.00 THB.
- **C.** Vanta Commerce INV-9001, 60,000.00 THB. Expect HOLD, because that invoice number is already on file.

The screen shows three cash scenarios, the rule that won, the extracted invoice, and an explanation in Thai and English. Approve and Reject record a human decision. Hold leaves the proposal open. No payment is sent. The history page lists every review and the Nemotron calls behind it.

If a Tavily key is present, the app searches the supplier name and tax id. If the key is absent, the check is labeled not verified. It does not invent a hit, and it does not treat the missing search as a failed search.

### How we built it

The web app is Next.js on Vercel Hobby. Postgres is Neon Free. On an empty database the app creates the tables and seeds the demo company, the cash and debt assumptions, and one anchor invoice so case C can detect a duplicate.

Inference is only Nebius Token Factory, using the OpenAI-compatible endpoint `POST https://api.tokenfactory.nebius.com/v1/chat/completions`.

- **Nemotron 3 Nano** extracts invoice JSON.
- **Nemotron 3 Ultra** writes the Thai and English explanation from the numbers the engine already computed.
- **Nemotron 3 Super** runs only if Ultra fails the call or a hallucination check.
- **Nemotron 3.5 Super VL** transcribes a photo, and Nano then extracts JSON from that transcript. The sample buttons are text, so they do not use the vision model.

Token Factory is what made that split practical. Four NVIDIA open models share one base URL and one API key. The code changes the `model` field. It does not run its own GPU service.

The decision itself is not a model output. `decide()` uses integer satang. DSCR is `cash_available * 1_000_000 / debt_service`. The 1.25 test is integer comparison. A validator rejects an explanation that cites a rule that did not run or a number that is not on the result. The stored outcome always comes from the engine.

### Challenges

The first live case B came back HOLD. Nano had turned a quantity that was already in thousandths (`1000`) into `1000000`, so the line total no longer matched. The engine was right to refuse. We changed the prompt so a labeled `quantity_millis` is copied unchanged, and we retry once if the printed integers and the JSON disagree. The next case B was PARTIAL at 45,000.00 THB.

Ultra spends reasoning tokens inside `max_tokens`. Short limits would cut off the JSON. We raised the completion budget and the HTTP timeout. On the successful runs the explanation still came back in a few seconds, and the validator accepted it, so Super was never called.

We also refused to fake the supplier check. With no Tavily key, a demo that showed “tax id found” would be a false document. The live reviews store `not_verified` and leave that rule as a warning.

### Accomplishments

On 18 October 2026 the corrected live samples did what the spec requires, with Token Factory in the path:

- Case A: PAY, `RULE-PAY-001`, DSCR 1.3255. Nano 2,627 ms (665 + 704 tokens). Ultra 3,289 ms (1,134 + 998). 3,501 tokens.
- Case B: PARTIAL 45,000.00 THB, `RULE-DSCR-001`. Nano 2,011 ms (634 + 584). Ultra 2,467 ms (1,173 + 903). 3,294 tokens.
- Case C: HOLD, `RULE-INV-001`. Nano 2,216 ms (635 + 671). Ultra 2,032 ms (1,077 + 565). 2,948 tokens.
- A 79% confidence invoice: INSUFFICIENT, `RULE-DATA-001`.

The explanation source on those rows is the model, not the template. The UI is English by default, with a Thai toggle, and the audit trail shows the Nemotron model names. Unit tests lock the money math without calling the API. Upload size, per-IP rate limits, and a daily Nemotron cap protect the Token Factory balance on the public link.

### What we learned

A large model is useful when it is boxed in. Nano is a good reader and a bad accountant. Ultra is a good narrator of a result it did not compute. The product got better when we stopped asking either model to decide.

Token Factory’s shared, OpenAI-compatible endpoint meant we could put Nano on the hot path and Ultra on the short explanation path without operating two services. Measured text reviews were a few seconds and a few thousand tokens. That is small enough to put in front of a person who is deciding a single bill.

We also learned to show a missing data source as missing. “Not verified” is a clearer sentence than a made-up registry card.

### What’s next

- Turn on Tavily with a real key so a tax id that is absent from a completed search can block payment. The code path is already there.
- Keep Super as the fallback, and record a run where Ultra is rejected so that path is visible in the audit log.
- Add the deferred pieces from the spec only after the proposal step is trusted: escrow release, milestone payout, and integrity snapshots. None of those move money today.
- Leave GPS verification off until there is a real job-site check. The column exists and is always null.

## Testing instructions for judges

1. Open https://arween-nexus.vercel.app. Language defaults to English.
2. Click **Run sample A**. Wait a few seconds. Expect a green PAY verdict and DSCR 1.3255.
3. Go back, run **sample B**. Expect an amber PARTIAL verdict, pay up to 45,000.00 THB.
4. Go back, run **sample C**. Expect a red HOLD verdict on `RULE-INV-001`. The tax check should say not verified, not “found”.
5. Switch **TH**. The same verdict is in Thai. Switch back to **EN**.
6. Open **History & Audit**. Select the row. The trail should name Nemotron Nano and Nemotron 3 Ultra, with latency and token counts, and retrieval `not_verified`.
7. You may Approve or Reject. That only changes the proposal status. The banner says no money moves. You do not need to click them to judge the proposal.

Samples are fictional. Re-running A or B voids the previous non-anchor copy so the button stays repeatable. The Vanta anchor invoice is never voided.
