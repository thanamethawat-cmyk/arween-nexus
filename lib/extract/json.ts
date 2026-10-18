export function extractJsonObject(text: string): unknown {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence?.[1] ?? stripped).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("model_json_missing");
  }
  return JSON.parse(body.slice(start, end + 1));
}
