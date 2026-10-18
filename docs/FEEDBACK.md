# Feedback — Nebius Token Factory and NVIDIA Nemotron

This note is only what we observed while building ARWEEN-Nexus on 18 October 2026. We called the public Token Factory pool. We did not deploy on Nebius AI Cloud, and we did not create a dedicated serverless endpoint.

## What we used

- Base URL: `https://api.tokenfactory.nebius.com/v1`
- Request: `POST /chat/completions` with `Authorization: Bearer` and a JSON body (`model`, `messages`, `temperature`, `max_tokens`). That is the OpenAI chat shape. It worked with `fetch`. We did not need a vendor SDK.
- Models we called successfully:
  - `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` for invoice JSON
  - `nvidia/Nemotron-3-Ultra-550b-a55b` for the Thai and English explanation
- Models we configured from the catalog and did not call in the stored runs:
  - `nvidia/nemotron-3-super-120b-a12b` (fallback if Ultra fails)
  - `nvidia/Nemotron-3.5-Super-VL` (photo transcription only)
- Catalog: `https://tokenfactory.nebius.com/api/public/models_info` listed those ids, context windows, and per-million token prices. On that day Nano was `$0.06` input / `$0.24` output, Super and Super VL `$0.30` / `$0.90`, Ultra `$1` / `$3`.

One key and one URL were enough to put Nano on extraction and Ultra on the explanation. That is the part of Token Factory that saved us from running two serving stacks.

## Latency and tokens we stored

All 22 `model_invocations` rows from that day have `provider = nebius` and `accepted = true`. None are Super. None are Super VL.

The spec run, after we fixed the quantity prompt:

| Case | Outcome | Nano | Ultra | Prompt + completion tokens |
| --- | --- | --- | --- | --- |
| A PAY | `RULE-PAY-001` | 2,627 ms, 665 + 704 | 3,289 ms, 1,134 + 998 | 3,501 |
| B PARTIAL | `RULE-DSCR-001`, cap 4,500,000 minor | 2,011 ms, 634 + 584 | 2,467 ms, 1,173 + 903 | 3,294 |
| C HOLD | `RULE-INV-001` | 2,216 ms, 635 + 671 | 2,032 ms, 1,077 + 565 | 2,948 |

A later 79% confidence invoice was `INSUFFICIENT` on `RULE-DATA-001`: Nano 2,519 ms (631 + 611), Ultra 1,832 ms (1,057 + 529).

Across the full set, Nano ranged from 2,011 ms to 5,287 ms and Ultra from 1,832 ms to 4,195 ms. Case B’s extract was 2,011 ms, then 5,287 ms, then 3,873 ms on repeats the same day. Completion tokens moved with the latency (584, then 1,153, then 831 on those three extracts). The endpoint was fast enough for a person waiting on one invoice, and the variance was large enough that we would not quote a single latency as the steady number.

## Friction we actually hit

**Nano rewrote a quantity that was already in thousandths.** On the first live case B, the invoice line said `quantity_millis` 1000. Nano returned 1000000. Our integer check then failed `RULE-INV-002`, so the outcome was HOLD instead of PARTIAL. The model call itself was accepted (2,572 ms, 571 prompt + 711 completion). The bug was the copied integer, not an HTTP error. We had told the model that “100 units is 100000”, and it applied that scaling to a field that was already scaled. The next prompt says to copy a labeled `quantity_millis` unchanged, and the pipeline retries once if the printed integers and the JSON disagree. The following case B was PARTIAL, with quantity 1000. Token Factory returned the bad integer cleanly. The guardrail had to notice.

**Reasoning is not in `content`.** Nano’s invoice JSON arrived in `message.content`. Reasoning arrived in a separate `message.reasoning` field. A client that only reads `content` is fine for the JSON. A client that assumes the whole answer is one string will mishandle the response. Ultra’s reasoning tokens also count against `max_tokens`. We set `max_tokens` to 8192 and the HTTP timeout to 180 seconds. The successful Ultra calls still finished in 1.8–4.2 s, so the high ceiling was headroom, not the typical duration.

**The explanation must not contain new digits.** Our validator rejects any number that is not already on the computed result. Invoice numbers and dates contain digits, so a free-form sentence fails even when the outcome is right. We ask Ultra to copy `template_th` and `template_en` from the payload. On every stored run, Ultra’s explanation was accepted. We therefore never observed the Super fallback. The fallback is in the code. It is not in the measurements.

**Images are a second model.** The catalog lists Nano as text-only. A PNG or JPEG has to go to Nemotron 3.5 Super VL first. We wired that, and we did not record a timed vision call. The sample buttons send text.

## What we did not observe

- A live call to Nemotron 3 Super or Nemotron 3.5 Super VL.
- A `response_format: json_object` rejection. The client retries without that field on HTTP 400 or 422. We did not see that status in the stored runs.
- A dedicated Token Factory endpoint. We used the public `/v1` pool.
- Nebius AI Cloud compute, Serverless Jobs, or DevPods.
- A Tavily request. The key was unset. All 11 retrieval rows are `not_verified` with `tax_id_found = false`. We did not invent search hits to fill the gap.

## Docs and developer experience

The public model catalog was enough to pick ids and to see which model could read an image. The chat-completions request matched the OpenAI shape we already knew, including Bearer auth and `usage.prompt_tokens` / `usage.completion_tokens`. The surprise was the extra `reasoning` field and the fact that those tokens share the completion budget. Both are workable once you have seen one raw response. They are easy to miss if you only test a short non-reasoning prompt.

For this app, Token Factory did the job we needed: several Nemotron checkpoints, one bill, one HTTP API, and latencies of a few seconds on a single invoice. The remaining work was on our side — stop the model from rescaling integers, and stop the explanation from introducing numbers the engine did not compute.
