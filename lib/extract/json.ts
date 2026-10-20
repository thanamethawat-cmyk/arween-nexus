/** Pull one invoice object out of a model reply. Does not fill in missing amounts. */
export function extractJsonObject(text: string): unknown {
  const stripped = stripModelChrome(text);
  const candidates = jsonObjects(stripped);
  const invoice = [...candidates].reverse().find(isInvoiceShaped);
  if (invoice) return invoice;
  if (candidates.length) return candidates[candidates.length - 1];
  throw new Error("model_json_missing");
}

export function stripModelChrome(text: string): string {
  const withoutThink = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\|think\|>[\s\S]*?<\|\/think\|>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/<\|\/?think\|>/gi, "");
  const fence = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence?.[1] ?? withoutThink).trim();
}

function isInvoiceShaped(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.invoice_number === "string" || typeof row.supplier_legal_name === "string" || Array.isArray(row.lines);
}

function jsonObjects(text: string): unknown[] {
  const found: unknown[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") continue;
    const end = balancedEnd(text, index);
    if (end < 0) continue;
    try {
      found.push(JSON.parse(text.slice(index, end + 1)));
    } catch {
      // A later brace pair may be the real object.
    }
  }
  return found;
}

function balancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
