export function toIgDirectMediaUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./i, "")
    if (!host.endsWith("instagram.com")) return null
    const parts = u.pathname.split("/").filter(Boolean)
    const kind = parts[0]
    const code = parts[1]
    if (!kind || !code) return null
    if (!["p", "reel", "reels", "tv"].includes(kind)) return null
    return `https://www.instagram.com/${kind}/${code}/media/?size=l`
  } catch {
    return null
  }
}
