import { createHash } from "crypto"
import { unstable_cache } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"

function ensureProxiedThumbnail(url: string): string {
  const s = String(url || "").trim()
  if (!s) return ""
  if (s.startsWith("/api/ig/thumbnail?url=")) return s
  if (s.startsWith("http")) return `/api/ig/thumbnail?url=${encodeURIComponent(s)}`
  return s
}

function isLikelyVideoUrl(u: string) {
  return /\.mp4(\?|$)/i.test(u)
}

function pickUrl(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function normalizeFeaturedItems(raw: unknown): any[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null
      const url = pickUrl(item, "url", "permalink", "link", "href", "postUrl", "post_url")
      let rawThumb = pickUrl(item, "thumbnailUrl", "thumbnail_url", "media_url", "mediaUrl", "thumbUrl", "thumb_url", "imageUrl", "image_url")
      if (rawThumb && isLikelyVideoUrl(rawThumb)) {
        rawThumb = pickUrl(item, "thumbnail_url", "thumbnailUrl")
      }
      const thumb = rawThumb ? ensureProxiedThumbnail(rawThumb) : ""

      if (!url && !thumb) return null

      return {
        id: typeof (item as any).id === "string" ? String((item as any).id) : `pub-${idx}`,
        type: "ig",
        isAdded: true,
        url: url || undefined,
        brand: typeof (item as any).brand === "string" ? (item as any).brand : "",
        collabType: typeof (item as any).collabType === "string" ? (item as any).collabType : "",
        caption: typeof (item as any).caption === "string" ? (item as any).caption : null,
        thumbnailUrl: thumb || null,
        thumbnail_url: thumb || null,
      }
    })
    .filter(Boolean) as any[]
}

export type PublicCreatorCard = {
  avatarUrl: string | null
  profileImageUrl: string | null
  displayName: string | null
  username: string | null
  aboutText: string | null
  primaryNiche: string | null
  featuredItems: any[]
  deliverables: any[]
  collaborationNiches: any[]
  themeTypes: any[]
  audienceProfiles: any[]
  pastCollaborations: any[]
  cardId: string
}

export async function fetchPublicCreatorCardById(id: string): Promise<{
  ok: boolean
  etag: string
  card: PublicCreatorCard | null
  error?: "not_found" | "service_error" | "env_missing"
}> {
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!hasServiceRoleKey) {
    return { ok: false, etag: computeEtag({ id, miss: "env" }), card: null, error: "env_missing" }
  }

  try {
    const read = unstable_cache(
      async () => {
        const supabase = createServiceClient()
        return await supabase
          .from("creator_cards")
          .select(
            "id, ig_username, display_name, niche, primary_niche, profile_image_url, avatar_url, is_public, about_text, audience, theme_types, audience_profiles, deliverables, collaboration_niches, past_collaborations, portfolio, featured_items",
          )
          .eq("id", id)
          .eq("is_public", true)
          .maybeSingle()
      },
      ["publicCreatorCardById", id],
      { revalidate: 300 },
    )

    const { data, error } = await read()

    if (error) {
      return { ok: false, etag: computeEtag({ id, miss: "err" }), card: null, error: "service_error" }
    }
    if (!data) {
      return { ok: false, etag: computeEtag({ id, miss: "nf" }), card: null, error: "not_found" }
    }

    const featuredCandidates = [
      (data as any).portfolio,
      ((data as any).portfolio as any)?.items,
      (data as any).featured_items,
      ((data as any).featured_items as any)?.items,
    ]

    let rawItems: unknown = []
    for (const c of featuredCandidates) {
      if (Array.isArray(c) && c.length > 0) {
        rawItems = c
        break
      }
    }

    const featuredItems = normalizeFeaturedItems(rawItems)

    const card: PublicCreatorCard = {
      avatarUrl: ((data as any).avatar_url || null) as string | null,
      profileImageUrl: ((data as any).avatar_url || (data as any).profile_image_url || null) as string | null,
      displayName: ((data as any).display_name || (data as any).ig_username || null) as string | null,
      username: ((data as any).ig_username || null) as string | null,
      aboutText: ((data as any).about_text || (data as any).audience || null) as string | null,
      primaryNiche: ((data as any).primary_niche || (data as any).niche || null) as string | null,
      featuredItems,
      deliverables: Array.isArray((data as any).deliverables) ? (data as any).deliverables : [],
      collaborationNiches: Array.isArray((data as any).collaboration_niches) ? (data as any).collaboration_niches : [],
      themeTypes: Array.isArray((data as any).theme_types) ? (data as any).theme_types : [],
      audienceProfiles: Array.isArray((data as any).audience_profiles) ? (data as any).audience_profiles : [],
      pastCollaborations: Array.isArray((data as any).past_collaborations) ? (data as any).past_collaborations : [],
      cardId: String((data as any).id),
    }

    const etag = computeEtag({
      id,
      // safe keys only
      username: card.username,
      displayName: card.displayName,
      featuredCount: featuredItems.length,
    })

    return { ok: true, etag, card }
  } catch {
    return { ok: false, etag: computeEtag({ id, miss: "catch" }), card: null, error: "service_error" }
  }
}

function computeEtag(input: unknown) {
  const raw = JSON.stringify(input)
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `W/"${hex}"`
}
