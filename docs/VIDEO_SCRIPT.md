# Demo video script — ARWEEN-Nexus

Length target: **2:45**, hard stop **3:00**. Judges are not asked to watch past three minutes.

Record the live site: https://arween-nexus.vercel.app

Desktop browser, about 1440 pixels wide, so the verdict table and the audit trail fit. Use the computer microphone. **No music.** The rules disallow copyrighted music and other copyrighted material unless you have permission. Silence under the voice is fine.

Speak the lines in simple English. Do not read model ids faster than you can say them. Each sample calls Nebius Token Factory, so leave the wait on screen. That wait is the proof.

If a click is slow, stay on the “Reading the document…” state. Do not cut it out.

## 0:00–0:18 — Open the demo

**On screen**

- Start on a blank desktop.
- Open `https://arween-nexus.vercel.app`.
- Pause on **New invoice review**. Point at the drop zone, the four cash cards, and sample cards A, B, and C.
- Point at **EN** so it is obvious the default language is English.

**Say**

“This is ARWEEN-Nexus. It reads a supplier invoice and proposes pay, pay a cap, hold, or ask for a better document. A person still decides. The app never moves money. The reading and the explanation run on NVIDIA Nemotron through Nebius Token Factory.”

## 0:18–0:50 — Case A, PAY

**On screen**

- Click **Run sample A**.
- Wait until the verdict replaces the upload screen.
- Point at the green banner: PAY, 37,450.00 THB.
- Point at DSCR `1.3255` and the winning rule `RULE-PAY-001`.
- Point at the three scenario cards. Full payment is the one that passes.

**Say**

“Case A is a fictional Harbor Supplies bill for 37,450 baht. Token Factory is working now. Nano extracts the invoice. Ultra writes the explanation. The pay-or-not decision is integer math, not the model. Full payment still leaves a coverage ratio of 1.3255, above 1.25, so the proposal is PAY.”

## 0:50–1:22 — Case B, PARTIAL

**On screen**

- Click **New review** in the sidebar.
- Click **Run sample B**.
- Wait for the amber banner.
- Point at “pay up to 45,000.00 THB” and rule `RULE-DSCR-001`.
- Point at **Pay in full** marked FAIL, DSCR `1.1000`.
- Point at **Partial max** marked recommended, DSCR `1.2500`.

**Say**

“Case B is 60,000 baht. Paying all of it drops coverage to 1.10. The engine caps the payment at 45,000 baht, which lands exactly on 1.25. That is a partial pay, not a model guess.”

## 1:22–1:48 — Case C, HOLD

**On screen**

- Click **New review**.
- Click **Run sample C**.
- Wait for the red HOLD banner.
- Point at winning rule `RULE-INV-001`.
- Scroll the rule list. Show the duplicate failure and the amber **not verified** row. Do not call it a failed tax search.

**Say**

“Case C is a duplicate invoice number, so the proposal is HOLD. There is no Tavily key on this demo. The supplier check says not verified. We do not invent a registry hit, and we do not pretend a search failed.”

## 1:48–2:08 — Thai and English

**On screen**

- Stay on the case C verdict.
- Click **TH**.
- Pause on the Thai headline and the Thai explanation under the rules.
- Click **EN**.

**Say**

“The reviewer can read Thai or English. Ultra already wrote both. This toggle does not call the model again.”

## 2:08–2:32 — Audit, Token Factory on screen

**On screen**

- Click **History & Audit**.
- Click the newest `INV-9001` row so the audit trail opens. If the trail is for a different invoice, click that invoice’s row.
- Point at the lines that say `extract · Nemotron Nano` and `explain · Nemotron 3 Ultra`, including the milliseconds and token counts.
- Point at `retrieval · not_verified`.

**Say**

“History keeps the real calls. This row is Nemotron Nano for extraction and Nemotron 3 Ultra for the explanation, through Nebius Token Factory, with the latency and token counts stored. Super is only a fallback. It was not needed on this run.”

## 2:32–2:50 — A person still decides

**On screen**

- Click the invoice number in the table to reopen the verdict.
- Point at **Reject**, **Hold**, and the colored approve button.
- Point at the sentence “AI proposes, you decide. No money moves until you confirm.”
- Do not click approve unless you have time. If you click it, show the status change to Confirmed and say again that no money moved.

**Say**

“Approve and reject only record the person’s choice. Hold leaves the proposal open. Nothing here sends a payment.”

## 2:50–3:00 — Close

**On screen**

- Stay on the verdict, or cut back to the audit lines with the Nemotron names. End on those names if you are tight on time.

**Say**

“ARWEEN-Nexus. Nemotron on Nebius Token Factory reads and explains. Integer rules decide. A person approves.”

## If you are over three minutes

Cut the approve button beat first. Keep case A, case B, case C, the TH/EN toggle, and the audit lines that name Nano and Ultra. Those five shots are the submission.

## Do not show

- API keys, `.env` files, or the Neon connection string.
- A fake Tavily result or a fake “tax id found” card.
- Copyrighted music, stock music you do not have a license for, or third-party logos you do not have the right to use.
