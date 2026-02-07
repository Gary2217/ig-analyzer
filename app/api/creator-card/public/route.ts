import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function getRequestId(req: Request) {
  const existing = (req.headers.get("x-request-id") ?? "").trim()
  return existing ? existing : crypto.randomUUID()
}

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
    .slice(0, 12)
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
        thumbnailUrl: thumb || null,
        thumbnail_url: thumb || null,
      }
    })
    .filter(Boolean) as any[]
}

function computeEtag(input: unknown) {
  const raw = JSON.stringify(input)
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `W/"${hex}"`
}

export async function GET(req: Request) {
  const start = Date.now()
  const requestId = getRequestId(req)
  try {
    const url = new URL(req.url)
    const handle = String(url.searchParams.get("handle") || "").trim()
    if (!handle) {
      return NextResponse.json(
        { ok: false, error: "missing_handle" },
        {
          status: 400,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
            "Server-Timing": `creator_card_public;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const { data, error } = await supabaseServer
      .from("creator_cards")
      .select("id, handle, ig_username, display_name, niche, primary_niche, profile_image_url, avatar_url, is_public, about_text, audience, theme_types, audience_profiles, deliverables, collaboration_niches, past_collaborations, portfolio, featured_items")
      .eq("handle", handle)
      .eq("is_public", true)
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { ok: false, error: "service_error" },
        {
          status: 500,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
            "Server-Timing": `creator_card_public;dur=${Date.now() - start}`,
          },
        },
      )
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
            "Server-Timing": `creator_card_public;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const row = asRecord(data as unknown) ?? {}

    const featuredCandidates = [
      row.portfolio,
      (row.portfolio as any)?.items,
      (row as any).featured_items,
      ((row as any).featured_items as any)?.items,
    ]

    let rawItems: unknown = []
    for (const c of featuredCandidates) {
      if (Array.isArray(c) && c.length > 0) {
        rawItems = c
        break
      }
    }
    const featuredItems = normalizeFeaturedItems(rawItems)

    const safeCard = {
      id: typeof row.id === "string" ? row.id : null,
      handle: typeof row.handle === "string" ? row.handle : null,
      profileImageUrl: typeof (row as any).avatar_url === "string" ? (row as any).avatar_url : typeof row.profile_image_url === "string" ? row.profile_image_url : null,
      displayName: typeof (row as any).display_name === "string" ? (row as any).display_name : typeof (row as any).ig_username === "string" ? (row as any).ig_username : null,
      username: typeof (row as any).ig_username === "string" ? (row as any).ig_username : null,
      aboutText: typeof (row as any).about_text === "string" ? (row as any).about_text : typeof row.audience === "string" ? row.audience : null,
      primaryNiche: typeof row.primary_niche === "string" ? row.primary_niche : typeof row.niche === "string" ? row.niche : null,
      featuredItems,
      deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
      collaborationNiches: Array.isArray(row.collaboration_niches) ? row.collaboration_niches : [],
      themeTypes: Array.isArray(row.theme_types) ? row.theme_types : [],
      audienceProfiles: Array.isArray(row.audience_profiles) ? row.audience_profiles : [],
      pastCollaborations: Array.isArray(row.past_collaborations) ? row.past_collaborations : [],
      cardId: typeof row.id === "string" ? row.id : null,
    }

    const etag = computeEtag({ v: 1, handle, id: safeCard.id, featured: featuredItems.length, name: safeCard.displayName })
    const inm = req.headers.get("if-none-match")
    if (inm && inm === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600")
      h.set("Server-Timing", `creator_card_public;dur=${Date.now() - start}`)
      return new NextResponse(null, { status: 304, headers: h })
    }

    return NextResponse.json(
      { ok: true, card: safeCard },
      {
        status: 200,
        headers: {
          "x-request-id": requestId,
          "ETag": etag,
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
          "Server-Timing": `creator_card_public;dur=${Date.now() - start}`,
        },
      },
    )
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    // requestId from outer scope is available here
    return NextResponse.json(
      { ok: false, error: "service_error" },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          "Server-Timing": `creator_card_public;dur=${Date.now() - start}`,
          "X-Error": msg.slice(0, 120),
        },
      },
    )
  }
}
