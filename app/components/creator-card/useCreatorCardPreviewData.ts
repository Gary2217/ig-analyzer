"use client"

import { useEffect, useState } from "react"

type IgProfile = {
  followers_count?: number
  follows_count?: number
  media_count?: number
  profile_picture_url?: string
}

type NormalizedCreatorCard = {
  profileImageUrl?: string | null
  displayName?: string | null
  username?: string | null
  aboutText?: string | null
  primaryNiche?: string | null
  contact?: any
  featuredItems?: any[]
  deliverables?: any[]
  collaborationNiches?: any[]
  themeTypes?: any[]
  audienceProfiles?: any[]
  pastCollaborations?: any[]
  creatorId?: string | null
  cardId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function finiteNumOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function pick<T = any>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const val = obj?.[k]
    if (val !== undefined && val !== null) return val as T
  }
  return undefined
}

function normalizeFeaturedItems(raw: any): any[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .map((it) => {
      if (!isRecord(it)) return null
      
      // Extract URL from various possible keys (for IG posts)
      const url = pick<string>(it, "url", "permalink", "link", "href", "postUrl", "post_url")
      
      // Extract raw thumbnail from various possible keys (for uploaded/local items)
      const rawThumb = pick<string>(it, "thumbnailUrl", "thumbnail_url", "thumbUrl", "thumb_url", "imageUrl", "image_url", "mediaUrl", "media_url")
      
      // Determine thumbnail URL based on what's available
      let thumbnailUrl: string | undefined
      if (url) {
        // IG post: proxy through our endpoint to avoid domain/CSP issues
        thumbnailUrl = `/api/ig/thumbnail?url=${encodeURIComponent(url)}`
      } else if (rawThumb) {
        // Uploaded/local item: use direct thumbnail
        thumbnailUrl = rawThumb
      }
      
      // Keep item if it has either a URL or a thumbnail
      if (!url && !thumbnailUrl) return null
      
      const type = pick<string>(it, "type", "mediaType", "media_type") ?? "ig_post"
      const caption = pick<string>(it, "caption")
      
      return {
        ...it,
        type,
        url: url || undefined,
        thumbnailUrl,
        caption: caption || null,
      }
    })
    .filter(Boolean) as any[]
}

function normalizeCreatorCardPayload(payload: unknown): NormalizedCreatorCard | null {
  if (!isRecord(payload)) return null
  const base = isRecord(payload.card) ? payload.card : payload

  const profileImageUrl = pick<string>(base, "profileImageUrl", "profile_image_url")
  const displayName = pick<string>(base, "displayName", "display_name", "name")
  const username = pick<string>(base, "username", "handle")
  const aboutText = pick<string>(base, "aboutText", "about_text", "bio", "audience")
  const primaryNiche = pick<string>(base, "primaryNiche", "primary_niche", "niche")

  const contactRaw = pick<any>(base, "contact", "contactInfo", "contact_info")
  const contact = isRecord(contactRaw)
    ? {
        email: pick<string>(contactRaw, "email", "Email"),
        other: pick<string>(contactRaw, "other", "Other", "line", "whatsapp"),
      }
    : {
        email: pick<string>(base, "email", "contactEmail", "contact_email"),
        other: pick<string>(base, "other", "contactOther", "contact_other"),
      }

  // Extract featured items from various possible locations
  // Support nested structures like payload.card.portfolio.items
  let featuredRaw: any = pick<any>(base, "portfolio", "featured", "featuredItems", "featured_items", "portfolioItems", "portfolio_items", "highlights")
  
  // If container is an object with items array, extract it
  let featuredArray: any[] = []
  if (Array.isArray(featuredRaw)) {
    featuredArray = featuredRaw
  } else if (isRecord(featuredRaw) && Array.isArray(featuredRaw.items)) {
    featuredArray = featuredRaw.items
  }
  
  const featuredItems = normalizeFeaturedItems(featuredArray)
  const deliverables = pick<any[]>(base, "deliverables", "formats", "formatTypes", "format_types") ?? []
  const collaborationNiches = pick<any[]>(base, "collaborationNiches", "collaboration_niches", "niches") ?? []
  const themeTypes = pick<any[]>(base, "themeTypes", "theme_types", "platforms") ?? []
  const audienceProfiles = pick<any[]>(base, "audienceProfiles", "audience_profiles") ?? []
  const pastCollaborations = pick<any[]>(base, "pastCollaborations", "past_collaborations", "brands") ?? []

  // Extract creatorId with support for nested shapes
  let creatorId = pick<string>(base, "creatorId", "creator_id", "userId", "user_id", "id")
  if (!creatorId && isRecord(base.creator)) {
    creatorId = pick<string>(base.creator, "id", "creatorId", "creator_id")
  }
  // Coerce to string if needed
  if (creatorId && typeof creatorId !== "string") {
    creatorId = String(creatorId)
  }

  return {
    ...base,
    profileImageUrl,
    displayName,
    username,
    aboutText,
    primaryNiche,
    contact,
    featuredItems,
    deliverables,
    collaborationNiches,
    themeTypes,
    audienceProfiles,
    pastCollaborations,
    creatorId,
    cardId: pick<string>(base, "cardId", "card_id", "id"),
  }
}

export function useCreatorCardPreviewData({ enabled }: { enabled: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const [creatorCard, setCreatorCard] = useState<NormalizedCreatorCard | null>(null)
  const [igProfile, setIgProfile] = useState<IgProfile | null>(null)
  const [engagementRatePct, setEngagementRatePct] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (creatorCard) return

    const controller = new AbortController()
    let cancelled = false

    const fetchData = async () => {
      try {
        setIsLoading(true)

        // First fetch creator card to get creatorId
        const cardRes = await fetch("/api/creator-card/me", { signal: controller.signal })
        if (cancelled) return

        let cardData: NormalizedCreatorCard | null = null
        let creatorId: string | null = null

        if (cardRes.ok) {
          try {
            const json = await cardRes.json()
            const normalized = normalizeCreatorCardPayload(json)
            cardData = normalized
            if (normalized) {
              creatorId = normalized.creatorId ?? null
            }
          } catch {}
        }

        // Now fetch IG profile and stats in parallel
        const [igRes, statsRes] = await Promise.all([
          fetch("/api/auth/instagram/me", { signal: controller.signal }),
          creatorId ? fetch(`/api/creators/${creatorId}/stats`, { signal: controller.signal }) : Promise.resolve(null),
        ])

        if (cancelled) return

        let igData: IgProfile | null = null
        let statsData: number | null = null

        if (igRes.ok) {
          try {
            const json = await igRes.json()
            const profile = isRecord(json) && isRecord(json.profile) ? json.profile : isRecord(json) ? json : null
            if (profile) {
              const followersCount = finiteNumOrNull(profile.followers_count)
              const followsCount = finiteNumOrNull(profile.follows_count)
              const mediaCount = finiteNumOrNull(profile.media_count)
              igData = {
                followers_count: followersCount ?? undefined,
                follows_count: followsCount ?? undefined,
                media_count: mediaCount ?? undefined,
                profile_picture_url: typeof profile.profile_picture_url === "string" ? profile.profile_picture_url : undefined,
              }
            }
          } catch {}
        }

        if (statsRes && statsRes.ok) {
          try {
            const json = await statsRes.json()
            if (isRecord(json)) {
              const statsObj = isRecord(json.stats) ? json.stats : json
              
              // Try all percent field variants (camelCase + snake_case)
              const pct = finiteNumOrNull(statsObj.engagementRatePct) ?? finiteNumOrNull(statsObj.engagement_rate_pct)
              
              // Try all ratio field variants (camelCase + snake_case)
              const ratio = finiteNumOrNull(statsObj.engagementRate) ?? finiteNumOrNull(statsObj.engagement_rate)
              
              // Use percent if available, else convert ratio to percent
              const engRate = pct ?? (ratio != null ? ratio * 100 : null)
              
              statsData = engRate
            }
          } catch {}
        }

        if (!cancelled) {
          setCreatorCard(cardData)
          setIgProfile(igData)
          setEngagementRatePct(statsData)
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("Failed to fetch creator card data", err)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled, creatorCard])

  const followers = igProfile?.followers_count ?? null
  const following = igProfile?.follows_count ?? null
  const posts = igProfile?.media_count ?? null

  return {
    isLoading,
    hasCard: !!creatorCard,
    cardId: creatorCard?.cardId ?? null,
    creatorId: creatorCard?.creatorId ?? null,
    creatorCard,
    igProfile,
    stats: engagementRatePct !== null ? { engagementRatePct } : null,
    followers: followers ?? undefined,
    following: following ?? undefined,
    posts: posts ?? undefined,
    engagementRate: engagementRatePct ?? undefined,
  }
}
