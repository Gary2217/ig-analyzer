export function extractIgUserIdFromInsightsId(v: unknown): string {
  if (typeof v !== "string") return ""
  const head = v.split("/")[0]?.trim() ?? ""
  return /^\d+$/.test(head) ? head : ""
}
