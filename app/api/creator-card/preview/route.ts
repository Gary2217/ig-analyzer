import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "crypto"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"
import { getMeState } from "@/app/lib/server/instagramMeResolver"

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
  if (v === null || v === undefined) return null
  if (typeof v === "string" && v.trim() === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function pickPositiveCount(obj: Record<string, unknown> | null, keys: string[]): number | null {
  const o = obj && typeof obj === "object" ? obj : null
  if (!o) return null

  for (const k of keys) {
    const v = (o as any)[k]
    const n = toFiniteNumOrNull(v)
    if (n !== null && n > 0) return Math.floor(n)
  }
  return null
}

function hasAnyNullishCounts(row: any): boolean {
  if (!row || typeof row !== "object") return true
  const f = toFiniteNumOrNull((row as any).followers)
  const following = toFiniteNumOrNull((row as any).following)
  const posts = toFiniteNumOrNull((row as any).posts)
  return f === null || following === null || posts === null
}

function isMissingColumnError(err: unknown, column: string): boolean {
  const e = err as any
  const code = typeof e?.code === "string" ? e.code : ""
  const msg = typeof e?.message === "string" ? e.message.toLowerCase() : ""
  if (code === "42703") return true
  return msg.includes("column") && msg.includes(column.toLowerCase())
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

    const thumbsPromise = cardId
      ? authed
          .from("creator_card_ig_posts")
          .select("posts, snapshot_at")
          .eq("user_id", userId)
          .eq("card_id", cardId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any)

    let supportsFollowingPosts = true
    const statsRes = await (async () => {
      if (!creatorId) return { data: null, error: null } as any

      const full = await supabaseServer
        .from("creator_stats")
        .select("creator_id, engagement_rate_pct, followers, following, posts, avg_likes, avg_comments, updated_at")
        .eq("creator_id", creatorId)
        .limit(1)
        .maybeSingle()

      if (!(full as any)?.error) return full

      const err = (full as any).error
      if (!isMissingColumnError(err, "following") && !isMissingColumnError(err, "posts")) {
        return full
      }

      supportsFollowingPosts = false
      return supabaseServer
        .from("creator_stats")
        .select("creator_id, engagement_rate_pct, followers, avg_likes, avg_comments, updated_at")
        .eq("creator_id", creatorId)
        .limit(1)
        .maybeSingle()
    })()

    const [thumbsRes] = await Promise.all([thumbsPromise])

    const tDbMs = Date.now() - tDbStart

    let statsRow = (statsRes as any)?.data ?? null

    // Safe fallback sync: if core counts missing, attempt a one-shot IG profile resolve and upsert into DB.
    // Guardrails:
    // - only if connected
    // - only if resolver igUserId matches creatorId from the user's creator card
    // - write is scoped by creator_id derived from the authenticated user's card
    if (creatorId && (supportsFollowingPosts ? hasAnyNullishCounts(statsRow) : toFiniteNumOrNull((statsRow as any)?.followers) === null)) {
      try {
        const meState = await getMeState(req)
        const meOk = Boolean((meState as any)?.connected)
        const meIgUserId = typeof (meState as any)?.igUserId === "string" ? String((meState as any).igUserId) : ""

        if (meOk && meIgUserId && meIgUserId === creatorId) {
          const profile = asRecord((meState as any)?.profile)
          const followersDb = toFiniteNumOrNull((statsRow as any)?.followers)
          const followingDb = supportsFollowingPosts ? toFiniteNumOrNull((statsRow as any)?.following) : null
          const postsDb = supportsFollowingPosts ? toFiniteNumOrNull((statsRow as any)?.posts) : null

          const followersIg = followersDb === null
            ? pickPositiveCount(profile, ["followers_count", "follower_count", "followers"])
            : null
          const followingIg = supportsFollowingPosts && followingDb === null
            ? pickPositiveCount(profile, ["follows_count", "following_count", "following", "follows"])
            : null
          const postsIg = supportsFollowingPosts && postsDb === null
            ? pickPositiveCount(profile, ["media_count", "posts", "post_count", "mediaCount"])
            : null

          if (followersIg !== null || followingIg !== null || postsIg !== null) {
            const upsertPayload: Record<string, unknown> = {
              creator_id: creatorId,
              ...(followersIg !== null ? { followers: followersIg } : {}),
              ...(followingIg !== null ? { following: followingIg } : {}),
              ...(postsIg !== null ? { posts: postsIg } : {}),
              updated_at: new Date().toISOString(),
            }

            const upsertRes = await supabaseServer
              .from("creator_stats")
              .upsert(upsertPayload, { onConflict: "creator_id" })
              .select(
                supportsFollowingPosts
                  ? "creator_id, engagement_rate_pct, followers, following, posts, avg_likes, avg_comments, updated_at"
                  : "creator_id, engagement_rate_pct, followers, avg_likes, avg_comments, updated_at",
              )
              .maybeSingle()

            if (!(upsertRes as any)?.error && (upsertRes as any)?.data) {
              statsRow = (upsertRes as any).data
            }
          }
        }
      } catch {
        // best-effort only
      }
    }

    const stats = (() => {
      // For connected users with a creator card, keep a stable object shape.
      const row = statsRow && typeof statsRow === "object" ? statsRow : null
      return {
        followers: row ? toFiniteNumOrNull((row as any).followers) : null,
        following: supportsFollowingPosts && row ? toFiniteNumOrNull((row as any).following) : null,
        posts: supportsFollowingPosts && row ? toFiniteNumOrNull((row as any).posts) : null,
        engagementRatePct: row ? toFiniteNumOrNull((row as any).engagement_rate_pct) : null,
        avgLikes: row ? toFiniteNumOrNull((row as any).avg_likes) : null,
        avgComments: row ? toFiniteNumOrNull((row as any).avg_comments) : null,
        updatedAt: row && typeof (row as any).updated_at === "string" ? (row as any).updated_at : null,
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
