export type Lang = "th" | "en";

const copy = {
  th: {
    product: "ARWEEN-Nexus",
    tagline: "ตรวจหลักฐานและคุ้มครองสภาพคล่อง ก่อนอนุมัติจ่ายบิล",
    review: "ตรวจบิล",
    history: "ประวัติ",
    audit: "บันทึกระบบ",
    language: "English",
    demoNebius: "ยังไม่มี NEBIUS_API_KEY — สกัดและคำอธิบายใช้ตัวอ่านฉลากกับประโยคมาตรฐาน ไม่มีการเรียก Nemotron",
    demoTavily: "ยังไม่มี TAVILY_API_KEY — การตรวจคู่ค้าเป็นสถานะ not verified ไม่มีการสร้างผลค้นหา เมื่อใส่คีย์ระบบจะเรียก Tavily จริง",
    liveNote: "คีย์ Nebius และ Tavily พร้อมแล้ว ระบบเรียก Token Factory และ Tavily จริง เลขผู้เสียภาษีที่ค้นไม่พบจะเป็น HOLD ตาม RULE-WEB-001",
    assumptions: "สมมติฐานงวดถัดไป",
    cashIn: "เงินสดรับ",
    cashOut: "รายจ่ายดำเนินงาน",
    principal: "เงินต้นที่ต้องชำระ",
    interest: "ดอกเบี้ยที่ต้องชำระ",
    saveAssumptions: "บันทึกสมมติฐาน",
    debtService: "ภาระหนี้",
    minCash: "เงินสดขั้นต่ำที่ DSCR 1.25",
    maxPay: "เพดานจ่ายที่ปลอดภัย",
    samples: "ข้อมูลตัวอย่างหนึ่งคลิก",
    samplesHint: "บริษัทสมมติทั้งหมด ใช้ตัวเลขจากสเปก TMS-001",
    upload: "อัปโหลดใบแจ้งหนี้",
    uploadHint: "PDF, รูป, TXT หรือ JSON ขนาดไม่เกิน 8 MB",
    paste: "หรือวางข้อความใบแจ้งหนี้",
    runPaste: "ตรวจข้อความนี้",
    actor: "ชื่อผู้กดยืนยัน",
    emptyTitle: "ยังไม่มีคำเสนอ",
    emptyBody: "อัปโหลดบิลหรือเปิดเคส A, B, C ระบบจะเสนอ PAY, PARTIAL, HOLD หรือ INSUFFICIENT โดยยังไม่โอนเงิน",
    working: "กำลังตรวจเอกสาร แล้วคำนวณด้วยจำนวนเต็ม",
    approve: "ยืนยันข้อเสนอ",
    reject: "ปฏิเสธข้อเสนอ",
    noMoney: "การกดนี้ไม่มีการเคลื่อนเงิน",
    fault: "ระบบไม่ตัดสินว่าฝ่ายใดผิด",
    scenarios: "สามสถานการณ์",
    rules: "กฎทั้ง 7 ข้อ",
    evidence: "หลักฐานคู่ค้า",
    models: "การเรียกโมเดล",
    gps: "การยืนยันพิกัดหน้างานถูกพักไว้ และไม่ถูกใช้ในการตัดสินรอบนี้",
    reset: "ยกเลิกบิลที่ไม่ใช่ตัวตั้งต้น",
    ceiling: "เพดานราคา Cartons",
    passes: "ผ่าน 1.25",
    misses: "ต่ำกว่า 1.25",
    noDebt: "ไม่มีหนี้",
    sourceDemo: "not verified",
    sourceLive: "Tavily",
    taxHit: "พบเลขผู้เสียภาษี",
    taxMiss: "ไม่พบเลขผู้เสียภาษีในแหล่งนี้",
    taxNotVerified: "not verified — ยังไม่เรียก Tavily และไม่มีผลค้นหาที่แต่งขึ้น",
    notVerified: "not verified",
    accepted: "รับคำอธิบาย",
    replaced: "ทิ้งคำอธิบาย ใช้ประโยคมาตรฐาน",
    statusProposed: "รอคนกด",
    statusConfirmed: "ยืนยันแล้ว",
    statusRejected: "ปฏิเสธแล้ว",
    historyEmpty: "ยังไม่มีคำตัดสิน",
    auditEmpty: "ยังไม่มีเหตุการณ์",
    partialCap: "เพดานที่เสนอ",
    confidence: "ความมั่นใจในการอ่าน",
    lines: "รายการ",
  },
  en: {
    product: "ARWEEN-Nexus",
    tagline: "Evidence and liquidity guardrail before a bill is approved",
    review: "Review",
    history: "History",
    audit: "Audit",
    language: "ไทย",
    demoNebius: "NEBIUS_API_KEY is missing. Extraction and the explanation use the labeled parser and template text. Nemotron is not called.",
    demoTavily: "TAVILY_API_KEY is missing. The counterparty check is labeled not verified. No search result is invented. The same query calls Tavily once the key is set.",
    liveNote: "Nebius and Tavily keys are set, so Token Factory and Tavily run live. A tax ID that is absent from the search becomes HOLD under RULE-WEB-001.",
    assumptions: "Next-period assumptions",
    cashIn: "Cash in",
    cashOut: "Operating cash out",
    principal: "Principal due",
    interest: "Interest due",
    saveAssumptions: "Save assumptions",
    debtService: "Debt service",
    minCash: "Cash floor for DSCR 1.25",
    maxPay: "Safe payment cap",
    samples: "One-click fictional samples",
    samplesHint: "All companies are fictional. Figures match spec TMS-001.",
    upload: "Upload an invoice",
    uploadHint: "PDF, image, TXT, or JSON up to 8 MB",
    paste: "Or paste invoice text",
    runPaste: "Review this text",
    actor: "Name on the confirmation",
    emptyTitle: "No proposal yet",
    emptyBody: "Upload a bill or open case A, B, or C. The app proposes PAY, PARTIAL, HOLD, or INSUFFICIENT and never moves money.",
    working: "Reading the document, then calculating with integers only",
    approve: "Approve recommendation",
    reject: "Reject recommendation",
    noMoney: "This click does not move money",
    fault: "No fault is assigned",
    scenarios: "Three scenarios",
    rules: "All 7 rules",
    evidence: "Counterparty evidence",
    models: "Model calls",
    gps: "Job-site GPS verification is deferred and is not part of this decision.",
    reset: "Void non-anchor invoices",
    ceiling: "Cartons reference ceiling",
    passes: "Clears 1.25",
    misses: "Below 1.25",
    noDebt: "No debt",
    sourceDemo: "not verified",
    sourceLive: "Tavily",
    taxHit: "Tax ID appears here",
    taxMiss: "Tax ID does not appear in this source",
    taxNotVerified: "not verified — Tavily was not called and no search result was invented",
    notVerified: "not verified",
    accepted: "Explanation kept",
    replaced: "Explanation rejected, template used",
    statusProposed: "Waiting for a person",
    statusConfirmed: "Confirmed",
    statusRejected: "Rejected",
    historyEmpty: "No decisions yet",
    auditEmpty: "No events yet",
    partialCap: "Proposed cap",
    confidence: "Read confidence",
    lines: "Lines",
  },
} as const;

export type CopyKey = keyof (typeof copy)["en"];

export function t(lang: Lang, key: CopyKey): string {
  return copy[lang][key];
}

const outcomes = {
  th: {
    PAY: "จ่ายเต็มจำนวน",
    PARTIAL: "แบ่งจ่าย",
    HOLD: "ระงับไว้ก่อน",
    INSUFFICIENT: "ข้อมูลไม่พอ",
  },
  en: {
    PAY: "Pay in full",
    PARTIAL: "Pay a capped amount",
    HOLD: "Hold",
    INSUFFICIENT: "Insufficient data",
  },
} as const;

export function outcomeLabel(lang: Lang, outcome: keyof (typeof outcomes)["en"]): string {
  return outcomes[lang][outcome];
}

const scenarios = {
  th: { held: "ไม่จ่าย", paid_full: "จ่ายเต็ม", partial_max: "จ่ายไม่เกินเพดาน" },
  en: { held: "Hold the bill", paid_full: "Pay in full", partial_max: "Pay the safe cap" },
} as const;

export function scenarioLabel(lang: Lang, kind: keyof (typeof scenarios)["en"]): string {
  return scenarios[lang][kind];
}

const details: Record<string, { th: string; en: string }> = {
  data_ok: { th: "ฟิลด์บังคับครบ สกุลเงินตรงกัน และความมั่นใจไม่ต่ำกว่า 80%", en: "Required fields are present, the currency matches, and confidence is at least 80%." },
  data_missing: { th: "ข้อมูลไม่พอ: {fields}", en: "Missing or rejected data: {fields}" },
  duplicate: { th: "พบใบแจ้งหนี้ {invoiceNumber} ของคู่ค้ารายนี้ที่ยังไม่ยกเลิก", en: "Invoice {invoiceNumber} for this counterparty is already open." },
  not_duplicate: { th: "ไม่พบใบแจ้งหนี้ {invoiceNumber} ที่ยังไม่ยกเลิก", en: "No open invoice numbered {invoiceNumber} for this counterparty." },
  invoice_math_ok: { th: "ผลรวมบรรทัด ภาษี และยอดสุทธิตรงสูตรจำนวนเต็ม", en: "Line totals, VAT, and the grand total match the integer formulas." },
  invoice_math_bad: { th: "ยอดในเอกสารไม่ตรงสูตร ({reason})", en: "The document amounts do not match the formulas ({reason})." },
  tax_found: { th: "แหล่งที่ตรวจมีเลขผู้เสียภาษีนี้", en: "A checked source contains this tax ID." },
  tax_missing: { th: "ไม่พบเลขผู้เสียภาษีจากแหล่งที่ตรวจ", en: "No checked source contains this tax ID." },
  not_verified: {
    th: "not verified — ยังไม่ได้เรียก Tavily จึงไม่ใช้กฎนี้ระงับการจ่าย และไม่มีการแต่งผลค้นหา",
    en: "not verified — Tavily was not called, so this rule does not block payment, and no search result was invented.",
  },
  dscr_ok: { th: "จ่ายเต็มแล้วยังผ่าน DSCR 1.25", en: "Full payment still clears DSCR 1.25." },
  dscr_partial: { th: "จ่ายเต็มไม่ผ่าน DSCR จึงเสนอเพดานจ่าย", en: "Full payment misses DSCR, so the proposal is the safe cap." },
  dscr_hold: { th: "จ่ายเต็มไม่ผ่าน DSCR และเพดานจ่ายไม่เกินศูนย์", en: "Full payment misses DSCR and the safe cap is not positive." },
  dscr_no_debt: { th: "งวดนี้ไม่มีภาระหนี้", en: "This period has no debt service." },
  dscr_no_forecast: { th: "ไม่มีสมมติฐานสำหรับคำนวณ DSCR", en: "Cash assumptions are missing, so DSCR cannot be computed." },
  price_ok: { th: "ไม่มีราคาต่อหน่วยเกินเพดานอ้างอิง", en: "No unit price is above a reference ceiling." },
  price_high: { th: "ราคาต่อหน่วยสูงกว่าเพดาน: {lines}", en: "Unit price is above the ceiling: {lines}" },
  pay_ok: { th: "ไม่มีกฎระดับระงับที่ล้ม จึงเสนอจ่ายเต็ม", en: "No blocking rule failed, so the proposal is pay in full." },
  pay_blocked: { th: "มีกฎระดับระงับที่ล้ม จึงไม่เสนอจ่ายเต็ม", en: "A blocking rule failed, so pay-in-full is not proposed." },
};

export function findingText(lang: Lang, detailKey: string, params: Record<string, string>): string {
  const template = details[detailKey]?.[lang] ?? detailKey;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? "");
}

export const SAMPLE_BLURBS = {
  th: {
    A: "INV-1044 Harbor Supplies ยอด 37,450 บาท คาดหมาย PAY และ DSCR 1.3255",
    B: "INV-2208 ยอด 60,000 บาท จ่ายเต็มแล้ว DSCR หลุด คาดหมาย PARTIAL ที่ 45,000 บาท",
    C: "INV-9001 Vanta Commerce บิลซ้ำ บรรทัดไม่ตรง และไม่พบเลขภาษี คาดหมาย HOLD ที่ RULE-INV-001",
  },
  en: {
    A: "INV-1044 Harbor Supplies, 37,450 THB. Expect PAY and DSCR 1.3255.",
    B: "INV-2208 at 60,000 THB. Full payment misses DSCR. Expect PARTIAL at 45,000 THB.",
    C: "INV-9001 Vanta Commerce. Duplicate, broken lines, tax ID not found. Expect HOLD on RULE-INV-001.",
  },
} as const;
