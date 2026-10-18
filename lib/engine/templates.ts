import { formatDscr, formatMinorPlain } from "./format";
import type { DecisionResult, InvoiceInput } from "./types";

export function templateExplanation(result: DecisionResult, invoice: InvoiceInput): { th: string; en: string } {
  const paid = result.scenarios.find((scenario) => scenario.kind === "paid_full");
  const total = formatMinorPlain(invoice.totalMinor);
  const cash = paid ? formatMinorPlain(paid.cashAvailableMinor) : "0";
  const dscr = paid?.dscrMicros !== null && paid?.dscrMicros !== undefined ? formatDscr(paid.dscrMicros) : "";
  const partial = result.partialAmountMinor !== null ? formatMinorPlain(result.partialAmountMinor) : "";
  const rule = result.winningRuleId;

  if (result.outcome === "INSUFFICIENT") {
    return {
      th: `ข้อเสนอคือ INSUFFICIENT ตาม ${rule} ความมั่นใจในการอ่านเอกสารหรือฟิลด์บังคับไม่ผ่านเกณฑ์ 8000 basis points ระบบไม่เดาตัวเลขและยังไม่มีการเคลื่อนเงิน`,
      en: `Proposed outcome is INSUFFICIENT under ${rule}. Extraction confidence or a required field missed the 8000 basis-point bar. No amount was guessed and no funds move.`,
    };
  }

  if (result.outcome === "PARTIAL") {
    return {
      th: `ข้อเสนอคือ PARTIAL ตาม ${rule} ยอดเอกสาร total_minor ${total} หากจ่ายเต็ม เงินสดคงเหลือ ${cash} และ DSCR ${dscr} ต่ำกว่าเกณฑ์ 1.25 เพดานจ่ายที่ยังผ่านเกณฑ์คือ ${partial} ยังไม่มีการเคลื่อนเงินจนกว่าคนจะกดยืนยัน`,
      en: `Proposed outcome is PARTIAL under ${rule}. Document total_minor is ${total}. Paying in full leaves cash_available_minor ${cash} and DSCR ${dscr}, below the 1.25 threshold. The cap that still clears the threshold is ${partial}. No funds move until a person confirms.`,
    };
  }

  if (result.outcome === "PAY") {
    return {
      th: `ข้อเสนอคือ PAY ตาม ${rule} ยอดเอกสาร total_minor ${total} หลังจ่ายเต็ม เงินสดคงเหลือ ${cash} และ DSCR ${dscr} สูงกว่าเกณฑ์ 1.25 ยังไม่มีการเคลื่อนเงินจนกว่าคนจะกดยืนยัน`,
      en: `Proposed outcome is PAY under ${rule}. Document total_minor is ${total}. After a full payment, cash_available_minor is ${cash} and DSCR is ${dscr}, above the 1.25 threshold. No funds move until a person confirms.`,
    };
  }

  const dscrSentenceTh = dscr ? ` หากจ่ายเต็ม เงินสดคงเหลือ ${cash} และ DSCR ${dscr}` : "";
  const dscrSentenceEn = dscr ? ` A full payment would leave cash_available_minor ${cash} and DSCR ${dscr}.` : "";
  return {
    th: `ข้อเสนอคือ HOLD ตาม ${rule} มีกฎระดับระงับที่ไม่ผ่าน ระบบไม่เสนอยอดจ่าย${dscrSentenceTh} ยังไม่มีการเคลื่อนเงิน`,
    en: `Proposed outcome is HOLD under ${rule}. A blocking rule failed, so no payment amount is proposed.${dscrSentenceEn} No funds move.`,
  };
}
