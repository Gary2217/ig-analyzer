import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "crypto"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const HANDLER_FILE = "app/api/creator-card/preview/route.ts"
const HANDLER_VERSION = "creator-preview-v1"

type CacheEntry = {
  at: number
  etag: string
  body: any
}

const __cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15_000

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function toFiniteNumOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function getRequestId(req: NextRequest) {
  const existing = req.headers.get("x-request-id")
  if (existing && existing.trim()) return existing.trim()
  return crypto.randomUUID()
}

function ensureProxiedThumb(url: string): string {
  const s = String(url || "").trim()
  if (!s) return ""
  if (s.startsWith("/api/ig/thumbnail?url=")) return s
  if (/^https?:\/\//i.test(s)) return `/api/ig/thumbnail?url=${encodeURIComponent(s)}`
  return s
}

function isLikelyVideoUrl(u: string) {
  return /\.mp4(\?|$)/i.test(u)
}

function pickThumbUrlFromPost(post: Record<string, unknown>): string {
  const thumbnailUrl = typeof post.thumbnail_url === "string" ? post.thumbnail_url : typeof (post as any).thumbnailUrl === "string" ? String((post as any).thumbnailUrl) : ""
  const mediaUrl = typeof post.media_url === "string" ? post.media_url : typeof (post as any).mediaUrl === "string" ? String((post as any).mediaUrl) : ""

  const t = thumbnailUrl.trim()
  const m = mediaUrl.trim()

  if (t) return t
  if (m && !isLikelyVideoUrl(m)) return m
  return ""
}

function computeEtag(input: unknown) {
  const raw = JSON.stringify(input)
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `W/"${hex}"`
}

function jsonRes(req: NextRequest, requestId: string, status: number, body: any, headers?: HeadersInit) {
  const h = new Headers(headers)
  h.set("x-request-id", requestId)
  h.set("Cache-Control", "no-store")
  h.set("X-Handler-File", HANDLER_FILE)
  h.set("X-Handler-Version", HANDLER_VERSION)
  return NextResponse.json(body, { status, headers: h })
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  const requestId = getRequestId(req)

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      const durationMs = Date.now() - start
      return jsonRes(
        req,
        requestId,
        200,
        { ok: false, error: "not_logged_in" },
        { "Server-Timing": `creator_preview;dur=${durationMs}` },
      )
    }

    const userId = user.id
    const cacheKey = userId
    const now = Date.now()
    const cached = __cache.get(cacheKey)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      const inm = req.headers.get("if-none-match")
      const durationMs = Date.now() - start
      if (inm && inm === cached.etag) {
        const h = new Headers()
        h.set("x-request-id", requestId)
        h.set("ETag", cached.etag)
        h.set("Cache-Control", "no-store")
        h.set("Server-Timing", `creator_preview;dur=${durationMs}`)
        h.set("X-Handler-File", HANDLER_FILE)
        h.set("X-Handler-Version", HANDLER_VERSION)
        return new NextResponse(null, { status: 304, headers: h })
      }

      return jsonRes(req, requestId, 200, cached.body, {
        ETag: cached.etag,
        "Server-Timing": `creator_preview;dur=${durationMs};desc=cache_hit`,
      })
    }

    const tDbStart = Date.now()

    const cardPromise = authed
      .from("creator_cards")
      .select("*, portfolio")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()

    const cardResult = await cardPromise
    const cardErr = (cardResult as any)?.error
    const cardRow = (cardResult as any)?.data ?? null

    if (cardErr) {
      const msg = typeof cardErr?.message === "string" ? cardErr.message : "unknown"
      const durationMs = Date.now() - start
      return jsonRes(
        req,
        requestId,
        500,
        { ok: false, error: "card_fetch_failed", message: msg.slice(0, 220) },
        { "Server-Timing": `creator_preview;dur=${durationMs}` },
      )
    }

    if (!cardRow) {
      const durationMs = Date.now() - start
      const body = { ok: true, card: null, stats: null, thumbs: [], me: null }
      const etag = computeEtag({ v: HANDLER_VERSION, userId, empty: true })
      __cache.set(cacheKey, { at: Date.now(), etag, body })
      return jsonRes(req, requestId, 200, body, {
        ETag: etag,
        "Server-Timing": `creator_preview;dur=${durationMs}`,
      })
    }

    const cardObj = asRecord(cardRow) ?? {}

    const cardId = typeof cardObj.id === "string" ? cardObj.id : null
    const creatorId = typeof (cardObj as any).ig_user_id === "string" ? String((cardObj as any).ig_user_id) : null
    const igUsername = typeof (cardObj as any).ig_username === "string" ? String((cardObj as any).ig_username) : null

    const statsPromise = creatorId
      ? supabaseServer
          .from("creator_stats")
          .select("creator_id, engagement_rate_pct, followers, avg_likes, avg_comments, updated_at")
          .eq("creator_id", creatorId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any)

    const thumbsPromise = cardId
      ? authed
          .from("creator_card_ig_posts")
          .select("posts, snapshot_at")
          .eq("user_id", userId)
          .eq("card_id", cardId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any)

    const [statsRes, thumbsRes] = await Promise.all([statsPromise, thumbsPromise])

    const tDbMs = Date.now() - tDbStart

    const statsRow = (statsRes as any)?.data ?? null
    const stats = (() => {
      if (!statsRow || typeof statsRow !== "object") return null
      return {
        followers: toFiniteNumOrNull((statsRow as any).followers),
        engagementRatePct: toFiniteNumOrNull((statsRow as any).engagement_rate_pct),
        avgLikes: toFiniteNumOrNull((statsRow as any).avg_likes),
        avgComments: toFiniteNumOrNull((statsRow as any).avg_comments),
        updatedAt: typeof (statsRow as any).updated_at === "string" ? (statsRow as any).updated_at : null,
      }
    })()

    const thumbsData = (thumbsRes as any)?.data ?? null
    const thumbs = (() => {
      const posts = Array.isArray(thumbsData?.posts) ? (thumbsData.posts as unknown[]) : []
      const list = posts.slice(0, 8).map((p, idx) => {
        const pr = asRecord(p) ?? {}
        const id = typeof pr.id === "string" ? pr.id : `p${idx}`
        const permalink = typeof pr.permalink === "string" ? pr.permalink : typeof (pr as any).url === "string" ? String((pr as any).url) : null
        const rawThumb = pickThumbUrlFromPost(pr)
        const thumbnailUrl = rawThumb ? ensureProxiedThumb(rawThumb) : ""
        return { id, thumbnailUrl, permalink }
      })
      return list.filter((x) => Boolean(x.thumbnailUrl))
    })()

    const me = creatorId || igUsername ? { igUserId: creatorId, igUsername } : null

    const cardPreview = {
      ...cardObj,
      profileImageUrl: typeof (cardObj as any).profile_image_url === "string" ? (cardObj as any).profile_image_url : null,
      avatarUrl: typeof (cardObj as any).avatar_url === "string" ? (cardObj as any).avatar_url : null,
      minPrice:
        typeof (cardObj as any).minPrice === "number"
          ? (cardObj as any).minPrice
          : typeof (cardObj as any).min_price === "number"
            ? (cardObj as any).min_price
            : null,
      collaborationNiches: Array.isArray((cardObj as any).collaboration_niches) ? (cardObj as any).collaboration_niches : null,
      pastCollaborations: Array.isArray((cardObj as any).past_collaborations) ? (cardObj as any).past_collaborations : null,
      themeTypes: Array.isArray((cardObj as any).theme_types) ? (cardObj as any).theme_types : null,
      audienceProfiles: Array.isArray((cardObj as any).audience_profiles) ? (cardObj as any).audience_profiles : null,
      featuredItems: Array.isArray((cardObj as any).featured_items) ? (cardObj as any).featured_items : [],
    }

    const etag = computeEtag({
      v: HANDLER_VERSION,
      userId,
      cardId,
      cardUpdatedAt: typeof (cardObj as any).updated_at === "string" ? (cardObj as any).updated_at : null,
      creatorId,
      statsUpdatedAt: stats?.updatedAt ?? null,
      thumbsAt: typeof thumbsData?.snapshot_at === "string" ? thumbsData.snapshot_at : null,
      thumbIds: thumbs.map((t) => t.id),
    })

    const ifNoneMatch = req.headers.get("if-none-match")
    const durationMs = Date.now() - start

    if (ifNoneMatch && ifNoneMatch === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "no-store")
      h.set("Server-Timing", `creator_preview;dur=${durationMs}, db;dur=${tDbMs}`)
      h.set("X-Handler-File", HANDLER_FILE)
      h.set("X-Handler-Version", HANDLER_VERSION)
      return new NextResponse(null, { status: 304, headers: h })
    }

    const body = {
      ok: true,
      card: cardPreview,
      stats,
      thumbs,
      me,
    }

    __cache.set(cacheKey, { at: Date.now(), etag, body })

    if (process.env.NODE_ENV !== "production") {
      console.log("[creator-preview] ok", {
        reqId: requestId ? String(requestId).slice(0, 80) : null,
        hasCard: Boolean(cardId),
        hasStats: Boolean(stats),
        thumbs: thumbs.length,
        durationMs,
      })
    }

    return jsonRes(req, requestId, 200, body, {
      ETag: etag,
      "Server-Timing": `creator_preview;dur=${durationMs}, db;dur=${tDbMs}`,
    })
  } catch (e: any) {
    const durationMs = Date.now() - start
    const msg = typeof e?.message === "string" ? e.message : "unknown"

    console.error("[creator-preview] error", {
      reqId: requestId ?? null,
      durationMs,
      message: msg,
    })

    return jsonRes(req, requestId, 500, { ok: false, error: "internal_error" }, { "Server-Timing": `creator_preview;dur=${durationMs}` })
  }
}
