import { NextResponse, type NextRequest } from "next/server"
import { createHash, randomUUID } from "crypto"
import { createAuthedClient, createServiceClient } from "@/lib/supabase/server"
import { fetchPublicCreatorCardById } from "@/app/lib/server/publicCreatorCard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getRequestId(req: NextRequest) {
  const existing = req.headers.get("x-request-id")
  if (existing && existing.trim()) return existing.trim()
  return randomUUID()
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
        id: typeof (item as any).id === "string" ? String((item as any).id) : `view-${idx}`,
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

function computeEtag(input: unknown) {
  const raw = JSON.stringify(input)
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `W/"${hex}"`
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  const requestId = getRequestId(req)

  try {
    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim()
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "missing_id" },
        {
          status: 400,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "no-store",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const publicRes = await fetchPublicCreatorCardById(id)
    if (publicRes.ok && publicRes.card) {
      const inm = req.headers.get("if-none-match")
      if (inm && inm === publicRes.etag) {
        const h = new Headers()
        h.set("x-request-id", requestId)
        h.set("ETag", publicRes.etag)
        h.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600")
        h.set("Server-Timing", `creator_card_view;dur=${Date.now() - start}`)
        return new NextResponse(null, { status: 304, headers: h })
      }

      return NextResponse.json(
        { ok: true, card: publicRes.card, visibility: "public" },
        {
          status: 200,
          headers: {
            "x-request-id": requestId,
            "ETag": publicRes.etag,
            "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "no-store",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("creator_cards")
      .select(
        "id, user_id, ig_username, display_name, niche, primary_niche, profile_image_url, avatar_url, is_public, about_text, audience, theme_types, audience_profiles, deliverables, collaboration_niches, past_collaborations, portfolio, featured_items",
      )
      .eq("id", id)
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { ok: false, error: "service_error" },
        {
          status: 500,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "no-store",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
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
            "Cache-Control": "no-store",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const ownerId = typeof (data as any).user_id === "string" ? String((data as any).user_id) : null
    if (!ownerId || ownerId !== user.id) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "no-store",
            "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const featuredCandidates = [
      (data as any).portfolio,
      ((data as any).portfolio as any)?.items,
      (data as any).featured_items,
      ((data as any).featured_items as any)?.items,
      (data as any).featuredItems,
      ((data as any).featuredItems as any)?.items,
    ]

    let rawItems: unknown = []
    for (const c of featuredCandidates) {
      if (Array.isArray(c) && c.length > 0) {
        rawItems = c
        break
      }
    }

    const featuredItems = normalizeFeaturedItems(rawItems)

    const card = {
      avatarUrl: ((data as any).avatar_url || null) as string | null,
      fallbackUrl: null as string | null,
      profileImageUrl: ((data as any).avatar_url || null) as string | null,
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

    const etag = computeEtag({ id, v: 1, username: card.username, displayName: card.displayName, featuredCount: featuredItems.length })

    const inm = req.headers.get("if-none-match")
    if (inm && inm === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "no-store")
      h.set("Server-Timing", `creator_card_view;dur=${Date.now() - start}`)
      return new NextResponse(null, { status: 304, headers: h })
    }

    return NextResponse.json(
      { ok: true, card, visibility: "owner" },
      {
        status: 200,
        headers: {
          "x-request-id": requestId,
          "ETag": etag,
          "Cache-Control": "no-store",
          "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
        },
      },
    )
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    return NextResponse.json(
      { ok: false, error: "service_error" },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
          "Cache-Control": "no-store",
          "Server-Timing": `creator_card_view;dur=${Date.now() - start}`,
          "X-Error": msg.slice(0, 120),
        },
      },
    )
  }
}
