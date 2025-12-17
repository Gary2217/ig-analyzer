export type Locale = "zh-TW" | "en"

export async function loadMessages(locale: Locale): Promise<any> {
  if (locale === "zh-TW") {
    const mod = await import("../messages/zh-TW.json")
    return (mod as any).default ?? mod
  }
  const mod = await import("../messages/en.json")
  return (mod as any).default ?? mod
}
