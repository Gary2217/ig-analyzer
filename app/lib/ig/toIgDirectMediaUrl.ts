function normalizeInstagramHostname(hostnameRaw: string): string {
  const h0 = String(hostnameRaw || "").trim().toLowerCase().replace(/\.$/, "")
  const h1 = h0.replace(/^(www\.|m\.)/i, "")
  return h1
}

function isInstagramHostname(hostnameRaw: string): boolean {
  return normalizeInstagramHostname(hostnameRaw) === "instagram.com"
}

function normalizePathSegments(pathnameRaw: string): string[] {
  return String(pathnameRaw || "")
    .trim()
    .split("/")
    .filter(Boolean)
}

export function toIgDirectMediaUrl(raw: string): string | null {
  const input = typeof raw === "string" ? raw.trim() : ""
  if (!input) return null
  try {
    const u = new URL(input)
    if (!isInstagramHostname(u.hostname)) return null
    const parts = normalizePathSegments(u.pathname)
    const kind = parts[0]
    const code = parts[1]
    if (!kind || !code) return null
    if (!["p", "reel", "reels", "tv"].includes(kind)) return null
    return `https://www.instagram.com/${kind}/${code}/media/?size=l`
  } catch {
    return null
  }
}
