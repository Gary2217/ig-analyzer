import { MatchmakingClient } from "./MatchmakingClient"
import { createPublicClient } from "@/lib/supabase/server"
import type { CreatorCard } from "./types"

export const dynamic = "force-dynamic"

interface MatchmakingPageProps {
  params: Promise<{
    locale: string
  }>
}

function hashStringToInt(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function svgAvatarDataUrl(seed: string, label: string) {
  const h = hashStringToInt(seed)
  const r1 = 40 + (h % 140)
  const g1 = 40 + ((h >>> 8) % 140)
  const b1 = 40 + ((h >>> 16) % 140)
  const r2 = 40 + ((h >>> 5) % 140)
  const g2 = 40 + ((h >>> 13) % 140)
  const b2 = 40 + ((h >>> 21) % 140)
  const initials = (label || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="rgb(${r1},${g1},${b1})"/>
      <stop offset="1" stop-color="rgb(${r2},${g2},${b2})"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#g)"/>
  <circle cx="256" cy="220" r="86" fill="rgba(255,255,255,0.22)"/>
  <path d="M96 448c34-78 92-118 160-118s126 40 160 118" fill="rgba(255,255,255,0.20)"/>
  <text x="256" y="260" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto" font-size="72" font-weight="800" fill="rgba(255,255,255,0.92)">${initials}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function fetchPublicCreatorCards(localePrefix: string): Promise<CreatorCard[]> {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_user_id, ig_username, niche, profile_image_url, avatar_url, updated_at, deliverables, min_price, contact")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error fetching public creator cards:", error)
      return []
    }

    // Map DB fields to CreatorCard type with defensive checks
    return (data || [])
      .filter((card) => card.id) // Only include cards with valid id
      .map((card) => {
        const displayName = card.ig_username || card.id
        const avatarUrl = (card as any).avatar_url || card.profile_image_url || svgAvatarDataUrl(String(card.id), displayName)
        return {
        id: card.id,
        igUserId: typeof (card as any).ig_user_id === "string" ? (card as any).ig_user_id : null,
        displayName,
        avatarUrl,
        category: card.niche || "Creator",
        deliverables: Array.isArray((card as any).deliverables) ? ((card as any).deliverables as string[]) : [],
        minPrice: typeof (card as any).min_price === "number" ? (card as any).min_price : null,
        contact: typeof (card as any).contact === "string" ? (card as any).contact : null,
        followerCount: 0,
        engagementRate: null,
        isVerified: false,
        profileUrl: `${localePrefix}/card/${card.id}`,
        }
      })
  } catch (error) {
    console.error("Error fetching creator cards:", error)
    return []
  }
}

export default async function MatchmakingPage({ params }: MatchmakingPageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"

  // Fetch real creator cards ordered by updated_at desc
  const creatorCards = await fetchPublicCreatorCards(localePrefix)

  return <MatchmakingClient locale={locale} initialCards={creatorCards} />
}
