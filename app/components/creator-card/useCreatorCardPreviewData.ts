"use client"

import { useEffect, useState } from "react"
import { useOptionalInstagramConnection } from "@/app/components/InstagramConnectionProvider"

type IgProfile = {
  followers_count?: number
  follows_count?: number
  media_count?: number
  profile_picture_url?: string
}

type NormalizedCreatorCard = {
  avatarUrl?: string | null
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
  if (v === null || v === undefined) return null
  if (typeof v === "string" && v.trim() === "") return null
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

export function isValidIgThumbnailProxyUrl(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/api/ig/thumbnail?url=")
}

export function normalizeIgThumbnailUrlOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  return isValidIgThumbnailProxyUrl(s) ? s : null
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
      const explicitNullThumb = (it as any).thumbnailUrl === null || (it as any).thumbnail_url === null
      
      // Determine thumbnail URL based on what's available
      const thumbnailUrl = explicitNullThumb ? null : normalizeIgThumbnailUrlOrNull(rawThumb)
      
      // Presence rule:
      // - IG items must be kept as long as they have a URL, regardless of thumbnail validity.
      // - thumbnailUrl controls rendering only.
      if (!url) return null
      
      const type = pick<string>(it, "type", "media_type") ?? "ig_post"
      const caption = pick<string>(it, "caption")
      const mediaType = pick<string>(it, "mediaType", "media_type")
      
      return {
        ...it,
        type,
        url: url || undefined,
        thumbnailUrl,
        caption: caption || null,
        mediaType: mediaType || null,
      }
    })
    .filter(Boolean) as any[]
}

function normalizeCreatorCardPayload(payload: unknown): NormalizedCreatorCard | null {
  if (!isRecord(payload)) return null
  const base = isRecord(payload.card) ? payload.card : payload

  const avatarUrl = pick<string>(base, "avatarUrl", "avatar_url")
  const profileImageUrl = pick<string>(base, "profileImageUrl", "profile_image_url")
  const displayName = pick<string>(base, "displayName", "display_name", "name")
  const username = pick<string>(base, "username", "handle", "ig_username", "igUsername")
  const aboutText = pick<string>(base, "aboutText", "about_text", "bio", "audience")
  const primaryNiche = pick<string>(base, "primaryNiche", "primary_niche", "niche")

  const contactRaw = pick<any>(base, "contact", "contactInfo", "contact_info")
  const contact = (() => {
    // If API returns the JSON string (current canonical form), keep it as-is.
    if (typeof contactRaw === "string") return contactRaw

    // If API returns an object, normalize into the new structure.
    if (isRecord(contactRaw)) {
      const readStr = (v: unknown) => (typeof v === "string" ? v.trim() : "")
      const readArr = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => readStr(x)).filter(Boolean) : ([] as string[])

      const emails = readArr((contactRaw as any).emails)
      const phones = readArr((contactRaw as any).phones)
      const lines = readArr((contactRaw as any).lines)
      const legacyOthers = readArr((contactRaw as any).others)

      const email1 = readStr((contactRaw as any).email) || readStr((contactRaw as any).Email)
      const phone1 = readStr((contactRaw as any).phone)
      const line1 = readStr((contactRaw as any).line)
      const other1 = readStr((contactRaw as any).other) || readStr((contactRaw as any).Other)

      const pcmRaw = readStr((contactRaw as any).primaryContactMethod)
      const primaryContactMethod = pcmRaw === "email" || pcmRaw === "phone" || pcmRaw === "line" ? pcmRaw : ""

      const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).slice(0, 20)
      const finalEmails = uniq([...(email1 ? [email1] : []), ...emails])
      const finalPhones = uniq([...(phone1 ? [phone1] : []), ...phones])
      const finalLines = (() => {
        const merged = uniq([...(line1 ? [line1] : []), ...lines])
        if (merged.length > 0) return merged
        return uniq([...(other1 ? [other1] : []), ...legacyOthers])
      })()

      if (finalEmails.length === 0 && finalPhones.length === 0 && finalLines.length === 0) return null
      return JSON.stringify({
        primaryContactMethod: primaryContactMethod || undefined,
        emails: finalEmails,
        phones: finalPhones,
        lines: finalLines,
      })
    }

    // Legacy fallback: accept top-level fields (older payload shapes)
    const emailLegacy = pick<string>(base, "email", "contactEmail", "contact_email") ?? ""
    const phoneLegacy = pick<string>(base, "phone", "contactPhone", "contact_phone") ?? ""
    const lineLegacy = pick<string>(base, "line", "contactLine", "contact_line") ?? ""
    const otherLegacy = pick<string>(base, "other", "contactOther", "contact_other") ?? ""

    const emails = emailLegacy ? [String(emailLegacy).trim()] : ([] as string[])
    const phones = phoneLegacy ? [String(phoneLegacy).trim()] : ([] as string[])
    const lines = lineLegacy ? [String(lineLegacy).trim()] : otherLegacy ? [String(otherLegacy).trim()] : ([] as string[])

    if (emails.length === 0 && phones.length === 0 && lines.length === 0) return null
    return JSON.stringify({ emails, phones, lines, primaryContactMethod: "email" })
  })()

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
    avatarUrl: avatarUrl ?? null,
    profileImageUrl: (avatarUrl ?? profileImageUrl) ?? null,
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
  const [previewStats, setPreviewStats] = useState<{
    followers?: number
    following?: number
    posts?: number
    avgLikes?: number
    avgComments?: number
    engagementRatePct?: number
  } | null>(null)

  const igConn = useOptionalInstagramConnection()
  const igMeOk = (() => {
    const ctxMe = igConn?.igMe as unknown
    const ctxMeObj = isRecord(ctxMe) ? (ctxMe as Record<string, unknown>) : null
    return ctxMeObj?.ok === true
  })()

  useEffect(() => {
    if (!enabled) return
    if (creatorCard) return

    const controller = new AbortController()
    let cancelled = false

    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Prefer aggregated preview endpoint (single request) for speed + tenant safety.
        // Fallback to legacy multi-fetch if needed.
        try {
          const res = await fetch("/api/creator-card/preview", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
            headers: { accept: "application/json" },
          })
          if (!cancelled && res.ok) {
            const json = await res.json().catch(() => null)
            const obj = isRecord(json) ? (json as Record<string, unknown>) : null
            if (obj?.ok === true) {
              const normalized = normalizeCreatorCardPayload(obj)
              const statsObj = isRecord(obj.stats) ? (obj.stats as Record<string, unknown>) : null

              const pct = finiteNumOrNull(statsObj?.engagementRatePct) ?? finiteNumOrNull(statsObj?.engagement_rate_pct)
              const followersFromStats = finiteNumOrNull(statsObj?.followers)
              const followingFromStats = finiteNumOrNull(statsObj?.following)
              const postsFromStats = finiteNumOrNull(statsObj?.posts)
              const avgLikesFromStats = finiteNumOrNull(statsObj?.avgLikes) ?? finiteNumOrNull(statsObj?.avg_likes)
              const avgCommentsFromStats = finiteNumOrNull(statsObj?.avgComments) ?? finiteNumOrNull(statsObj?.avg_comments)

              if (!cancelled) {
                setCreatorCard(normalized)
                setEngagementRatePct(pct)

                setPreviewStats(
                  statsObj
                    ? {
                        followers: followersFromStats ?? undefined,
                        following: followingFromStats ?? undefined,
                        posts: postsFromStats ?? undefined,
                        avgLikes: avgLikesFromStats ?? undefined,
                        avgComments: avgCommentsFromStats ?? undefined,
                        engagementRatePct: pct ?? undefined,
                      }
                    : null,
                )

                // Best-effort: allow stats to fill followers if IG profile isn't available yet.
                // (Keep current return shape: followers/following/posts still primarily from igProfile.)
                void followersFromStats
              }

              return
            }
          }
        } catch {
          // fall back below
        }

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

        const ctxMe = igConn?.igMe as unknown
        const ctxMeObj = isRecord(ctxMe) ? (ctxMe as Record<string, unknown>) : null
        const ctxOk = ctxMeObj?.ok === true

        // Prefer provider-cached /api/auth/instagram/me to avoid duplicate calls.
        const igRes = ctxOk ? null : await fetch("/api/auth/instagram/me", { signal: controller.signal })
        const statsRes = creatorId ? await fetch(`/api/creators/${creatorId}/stats`, { signal: controller.signal }) : null

        if (cancelled) return

        let igData: IgProfile | null = null
        let statsData: number | null = null

        if (ctxOk) {
          const profile = isRecord((ctxMeObj as any)?.profile)
            ? ((ctxMeObj as any).profile as any)
            : (ctxMeObj as any)
          const followersCount = finiteNumOrNull(profile?.followers_count)
          const followsCount = finiteNumOrNull(profile?.follows_count)
          const mediaCount = finiteNumOrNull(profile?.media_count)
          igData = {
            followers_count: followersCount ?? undefined,
            follows_count: followsCount ?? undefined,
            media_count: mediaCount ?? undefined,
            profile_picture_url: typeof profile?.profile_picture_url === "string" ? profile.profile_picture_url : undefined,
          }
        } else if (igRes && igRes.ok) {
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
  }, [creatorCard, enabled, igMeOk])

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
    stats: previewStats ?? (engagementRatePct !== null ? { engagementRatePct } : null),
    followers: previewStats?.followers ?? undefined,
    following: previewStats?.following ?? undefined,
    posts: previewStats?.posts ?? undefined,
    avgLikes: previewStats?.avgLikes ?? undefined,
    avgComments: previewStats?.avgComments ?? undefined,
    engagementRate: (previewStats?.engagementRatePct ?? engagementRatePct) ?? undefined,
  }
}
