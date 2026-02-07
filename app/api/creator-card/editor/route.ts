import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const HANDLER_FILE = "app/api/creator-card/editor/route.ts"
const HANDLER_VERSION = "creator-card-editor-v1"

const __cache = new Map<string, { at: number; etag: string; body: any }>()
const CACHE_TTL_MS = 10_000

function makeRequestId() {
  try {
    const g = globalThis as any
    const maybeCrypto = g?.crypto
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") return String(maybeCrypto.randomUUID())
  } catch {
    // ignore
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateRequestId(req: Request) {
  const existing = (req.headers.get("x-request-id") ?? "").trim()
  return existing ? existing : makeRequestId()
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null
  return v as Record<string, unknown>
}

function toFiniteNumOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v
}

function ensureProxiedThumb(raw: string) {
  const s = String(raw || "").trim()
  if (!s) return ""
  if (s.startsWith("/api/ig/thumbnail?url=")) return s
  if (s.startsWith("http")) return `/api/ig/thumbnail?url=${encodeURIComponent(s)}`
  return s
}

function pickThumbUrlFromPost(pr: Record<string, unknown>) {
  const candidates = [
    pr.thumbnail_url,
    (pr as any).thumbnailUrl,
    (pr as any).media_url,
    (pr as any).mediaUrl,
    (pr as any).image_url,
    (pr as any).imageUrl,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = c.trim()
      if (/\.mp4(\?|$)/i.test(s)) continue
      return s
    }
  }
  return null
}

function computeEtag(input: unknown) {
  const raw = JSON.stringify(input)
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `W/"${hex}"`
}

function jsonRes(req: Request, requestId: string, status: number, body: any, extraHeaders?: Record<string, string>) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "x-request-id": requestId,
    "X-Handler-File": HANDLER_FILE,
    "X-Handler-Version": HANDLER_VERSION,
  })
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v)
  }
  return NextResponse.json(body, { status, headers })
}

export async function GET(req: Request) {
  const start = Date.now()
  const requestId = getOrCreateRequestId(req)

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      const durationMs = Date.now() - start
      return jsonRes(req, requestId, 200, { ok: false, error: "not_logged_in" }, { "Server-Timing": `creator_card_editor;dur=${durationMs}` })
    }

    const cacheKey = `u:${user.id}`
    const now = Date.now()
    const cached = __cache.get(cacheKey)
    if (cached && now - cached.at <= CACHE_TTL_MS) {
      const ifNoneMatch = req.headers.get("if-none-match")
      const durationMs = Date.now() - start
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        const h = new Headers()
        h.set("x-request-id", requestId)
        h.set("ETag", cached.etag)
        h.set("Cache-Control", "no-store")
        h.set("X-Handler-File", HANDLER_FILE)
        h.set("X-Handler-Version", HANDLER_VERSION)
        h.set("Server-Timing", `creator_card_editor;dur=${durationMs}, cache;dur=0`)
        return new NextResponse(null, { status: 304, headers: h })
      }
      return jsonRes(req, requestId, 200, cached.body, {
        ETag: cached.etag,
        "Server-Timing": `creator_card_editor;dur=${durationMs}, cache;dur=0`,
      })
    }

    const tDbStart = Date.now()

    const cardRes = await authed.from("creator_cards").select("*, portfolio").eq("user_id", user.id).limit(1).maybeSingle()
    const cardErr = (cardRes as any)?.error
    const cardRow = (cardRes as any)?.data ?? null

    if (cardErr) {
      const msg = typeof cardErr?.message === "string" ? cardErr.message : "unknown"
      const durationMs = Date.now() - start
      return jsonRes(
        req,
        requestId,
        500,
        { ok: false, error: "card_fetch_failed", message: msg.slice(0, 220) },
        { "Server-Timing": `creator_card_editor;dur=${durationMs}` },
      )
    }

    if (!cardRow) {
      const durationMs = Date.now() - start
      const body = { ok: false, error: "no_card", card: null, thumbs: [], me: null, stats: null, igConnection: { connected: false } }
      const etag = computeEtag({ v: HANDLER_VERSION, userId: user.id, empty: true })
      __cache.set(cacheKey, { at: Date.now(), etag, body })
      return jsonRes(req, requestId, 200, body, { ETag: etag, "Server-Timing": `creator_card_editor;dur=${durationMs}, db;dur=${Date.now() - tDbStart}` })
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
          .eq("user_id", user.id)
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

    const igConnection = {
      connected: Boolean(creatorId || igUsername),
      username: igUsername,
      profileImageUrl:
        typeof (cardObj as any).avatar_url === "string"
          ? (cardObj as any).avatar_url
          : typeof (cardObj as any).profile_image_url === "string"
            ? (cardObj as any).profile_image_url
            : null,
    }

    const body = { ok: true, card: cardObj, thumbs, me, stats, igConnection }

    const etag = computeEtag({
      v: HANDLER_VERSION,
      userId: user.id,
      cardId,
      cardUpdatedAt: typeof (cardObj as any).updated_at === "string" ? (cardObj as any).updated_at : null,
      creatorId,
      statsUpdatedAt: stats?.updatedAt ?? null,
      thumbsAt: typeof thumbsData?.snapshot_at === "string" ? thumbsData.snapshot_at : null,
      thumbIds: thumbs.map((t) => t.id),
    })

    const ifNoneMatch = req.headers.get("if-none-match")
    const durationMs = Date.now() - start

    __cache.set(cacheKey, { at: Date.now(), etag, body })

    if (ifNoneMatch && ifNoneMatch === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "no-store")
      h.set("X-Handler-File", HANDLER_FILE)
      h.set("X-Handler-Version", HANDLER_VERSION)
      h.set("Server-Timing", `creator_card_editor;dur=${durationMs}, db;dur=${tDbMs}`)
      return new NextResponse(null, { status: 304, headers: h })
    }

    if (process.env.NODE_ENV !== "production" || process.env.CREATOR_CARD_DEBUG === "1") {
      console.log("[creator-card/editor]", {
        at: new Date().toISOString(),
        requestId,
        userId: user.id,
        cardId,
        thumbs: thumbs.length,
      })
    }

    return jsonRes(req, requestId, 200, body, {
      ETag: etag,
      "Server-Timing": `creator_card_editor;dur=${durationMs}, db;dur=${tDbMs}`,
    })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    const durationMs = Date.now() - start
    return jsonRes(req, requestId, 500, { ok: false, error: "unexpected_error", message: msg.slice(0, 220) }, { "Server-Timing": `creator_card_editor;dur=${durationMs}` })
  }
}
