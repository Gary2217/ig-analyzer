import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient } from "@/lib/supabase/server"
import { readIgMediaItems, upsertIgMediaItems } from "@/lib/server/igCache"

const GRAPH_VERSION = "v24.0"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const __DEV__ = process.env.NODE_ENV !== "production"
const __missingVideoThumbLogSet = new Set<string>()
const __MISSING_VIDEO_THUMB_LOG_MAX = 50

function extractShortcodeFromUrl(url: string): string {
  const s = typeof url === "string" ? url.trim() : ""
  if (!s) return ""
  try {
    const u = new URL(s)
    const parts = u.pathname.split("/").filter(Boolean)
    if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels")) {
      return String(parts[1] || "").trim()
    }
  } catch {
    // ignore
  }
  try {
    const m = /\/(p|reel|reels)\/([^\/\?\#]+)/i.exec(s)
    return m && m[2] ? String(m[2]).trim() : ""
  } catch {
    return ""
  }
}

function deriveVideoThumbUrl(permalinkRaw: string, shortcodeRaw: string, fallbackUrlRaw?: string): string {
  const pl = typeof permalinkRaw === "string" ? permalinkRaw.trim() : ""
  if (pl && pl.startsWith("http")) {
    const base = pl.replace(/\/?$/, "/")
    return `${base}media/?size=l`
  }
  const sc = typeof shortcodeRaw === "string" ? shortcodeRaw.trim() : ""
  if (sc) return `https://www.instagram.com/p/${sc}/media/?size=l`
  const sc2 = extractShortcodeFromUrl(typeof fallbackUrlRaw === "string" ? fallbackUrlRaw : "")
  if (sc2) return `https://www.instagram.com/p/${sc2}/media/?size=l`
  return ""
}

function enrichVideoThumbsInPlace(payload: any) {
  const list: any[] = Array.isArray(payload?.data) ? payload.data : []
  if (list.length === 0) return

  for (const it of list) {
    if (!it || typeof it !== "object") continue
    const mt = String((it as any).media_type ?? (it as any).mediaType ?? "").toUpperCase()
    const isVideo = mt === "VIDEO" || mt === "REELS" || mt.includes("REEL")
    if (!isVideo) continue

    const tuRaw = (it as any).thumbnail_url
    const tu = typeof tuRaw === "string" ? tuRaw.trim() : ""
    if (tu) continue

    const pl = typeof (it as any).permalink === "string" ? String((it as any).permalink) : ""
    const sc = typeof (it as any).shortcode === "string" ? String((it as any).shortcode) : ""
    const fallbackUrl =
      (typeof (it as any).ig_permalink === "string" ? String((it as any).ig_permalink) : "") ||
      (typeof (it as any).url === "string" ? String((it as any).url) : "") ||
      (typeof (it as any).link === "string" ? String((it as any).link) : "") ||
      ""

    const derived = deriveVideoThumbUrl(pl, sc, fallbackUrl || pl)
    if (derived) {
      ;(it as any).thumbnail_url = derived
      continue
    }

    if (__DEV__ && __missingVideoThumbLogSet.size < __MISSING_VIDEO_THUMB_LOG_MAX) {
      const id = String((it as any).id || "")
      const key = `${id}:${pl || fallbackUrl || ""}`.slice(0, 220)
      if (!__missingVideoThumbLogSet.has(key)) {
        __missingVideoThumbLogSet.add(key)
        // eslint-disable-next-line no-console
        console.debug("[media] video missing thumbnail_url (unrecoverable)", {
          id: id || null,
          hasPermalink: Boolean(pl && pl.trim()),
          hasShortcode: Boolean(sc && sc.trim()),
        })
      }
    }
  }
}

function getIsHttps(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  return xfProto === "https" || req.nextUrl.protocol === "https:"
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache for rate-limit mitigation
// ─────────────────────────────────────────────────────────────────────────────
type MediaCacheEntry = {
  at: number
  status: number
  data: any
  kind: "success" | "rate_limited"
}

const SUCCESS_TTL_MS = 600 * 1000 // 10 minutes
const RATE_LIMIT_TTL_MS = 120 * 1000 // 2 minutes cooldown

const DB_STALE_MS = 5 * 60 * 1000 // 5 minutes

const __mediaCache = new Map<string, MediaCacheEntry>()

// ─────────────────────────────────────────────────────────────────────────────
// Response header builder
// ─────────────────────────────────────────────────────────────────────────────
type HeaderMeta = {
  cache: "hit" | "miss"
  kind: "success" | "rate_limited" | "none"
  ageSeconds: number
  upstream: "called" | "skipped"
}

function buildHeaders(meta: HeaderMeta): Headers {
  const h = new Headers()
  h.set("Cache-Control", "no-store")
  h.set("X-Media-Cache", meta.cache)
  h.set("X-Media-Cache-Kind", meta.kind)
  h.set("X-Media-Cache-Age", String(Math.max(0, Math.floor(meta.ageSeconds))))
  h.set("X-Media-Upstream", meta.upstream)
  return h
}

function jsonRes(body: any, status: number, meta: HeaderMeta) {
  return NextResponse.json(body, { status, headers: buildHeaders(meta) })
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit detection (TYPE-SAFE)
// ─────────────────────────────────────────────────────────────────────────────
function isRateLimited(body: unknown, detail: string): boolean {
  const isRec = (v: unknown): v is Record<string, unknown> =>
    Boolean(v && typeof v === "object")

  const b = isRec(body) ? body : {}
  const err = isRec((b as any).error) ? (b as any).error : {}

  const code = Number((err as any).code ?? (b as any).code)
  const subcode = Number(
    (err as any).error_subcode ?? (b as any).error_subcode
  )

  const combinedMsg = [
    (err as any).message,
    (b as any).message,
    (err as any).error_user_msg,
    (err as any).error_user_title,
    detail,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase()

  return (
    code === 4 ||
    code === 17 ||
    subcode === 2446079 ||
    combinedMsg.includes("rate limit") ||
    combinedMsg.includes("too many") ||
    combinedMsg.includes("reduce")
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function toShortDetail(v: unknown) {
  const s = typeof v === "string" ? v : v == null ? "" : String(v)
  const trimmed = s.trim()
  if (!trimmed) return ""
  const redacted = trimmed.replace(
    /access_token=([^&\s]+)/gi,
    "access_token=REDACTED"
  )
  return redacted.length > 180 ? `${redacted.slice(0, 180)}…` : redacted
}

function stripAccessTokenFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr)
    if (u.searchParams.has("access_token")) {
      u.searchParams.delete("access_token")
    }
    return u.toString()
  } catch {
    return null
  }
}

function sanitizeGraphPayload<T>(payload: T): T {
  let safe: any
  try {
    safe =
      typeof (globalThis as any).structuredClone === "function"
        ? (globalThis as any).structuredClone(payload)
        : JSON.parse(JSON.stringify(payload))
  } catch {
    safe = JSON.parse(JSON.stringify(payload))
  }

  if (safe?.paging?.next && typeof safe.paging.next === "string") {
    const stripped = stripAccessTokenFromUrl(safe.paging.next)
    safe.paging.next = stripped ?? null
  }

  return safe
}

function jsonError(message: string, extra?: any, status = 400) {
  return jsonRes(
    { ...extra, error: message },
    status,
    { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" }
  )
}

function jsonUpstreamTimeout() {
  return jsonRes(
    { ok: false, error: "upstream_timeout", detail: null },
    504,
    { cache: "miss", kind: "none", ageSeconds: 0, upstream: "called" }
  )
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError"
}

function safeLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)

    const DEFAULT_LIMIT = 25
    const MAX_LIMIT = 100

    const afterRaw = url.searchParams.get("after") || ""
    const after = afterRaw && afterRaw.length > 600 ? afterRaw.slice(0, 600) : afterRaw

    const limitRaw = url.searchParams.get("limit") || ""
    const parsedLimit = Number(limitRaw)
    const limitNum = Number.isFinite(parsedLimit) && Number.isInteger(parsedLimit) ? parsedLimit : DEFAULT_LIMIT
    const limit = String(Math.max(3, Math.min(MAX_LIMIT, limitNum)))

    const c = await cookies()
    const isHttps = getIsHttps(req)
    const baseCookieOptions = {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax" as const,
      path: "/",
    } as const

    const userAccessToken = (c.get("ig_access_token")?.value ?? "").trim()
    let igIdFromCookie = (c.get("ig_ig_id")?.value ?? "").trim()
    let pageIdFromCookie = (c.get("ig_page_id")?.value ?? "").trim()

    if (!userAccessToken) {
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_access_token", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" }
      )
    }

    if (userAccessToken && (!igIdFromCookie || !pageIdFromCookie)) {
      try {
        const graphUrl = new URL(
          `https://graph.facebook.com/v21.0/me/accounts`
        )
        graphUrl.searchParams.set(
          "fields",
          "name,instagram_business_account"
        )
        graphUrl.searchParams.set("access_token", userAccessToken)

        let r: Response
        try {
          r = await fetchWithTimeout(
            graphUrl.toString(),
            {
              method: "GET",
              cache: "no-store",
            },
            10_000
          )
        } catch (e: unknown) {
          if (isAbortError(e)) return jsonUpstreamTimeout()
          throw e
        }
        if (r.ok) {
          const data = (await r.json()) as any
          const list: any[] = Array.isArray(data?.data) ? data.data : []
          const picked = list.find(
            (p) => p?.instagram_business_account?.id
          )
          const nextPageId =
            typeof picked?.id === "string" ? picked.id : ""
          const nextIgId =
            typeof picked?.instagram_business_account?.id === "string"
              ? picked.instagram_business_account.id
              : ""

          if (!pageIdFromCookie && nextPageId)
            pageIdFromCookie = nextPageId
          if (!igIdFromCookie && nextIgId) igIdFromCookie = nextIgId

          if (pageIdFromCookie)
            c.set("ig_page_id", pageIdFromCookie, baseCookieOptions)
          if (igIdFromCookie)
            c.set("ig_ig_id", igIdFromCookie, baseCookieOptions)
        }
      } catch {
        // swallow
      }
    }

    if (!igIdFromCookie) {
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_ig_id", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" }
      )
    }

    if (!pageIdFromCookie) {
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_page_id", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" }
      )
    }

    const igBusinessId = igIdFromCookie
    const pageId = pageIdFromCookie

    const cacheKey = `${igBusinessId}:${pageId}`
    const cached = __mediaCache.get(cacheKey)
    if (cached) {
      const ttl =
        cached.kind === "success" ? SUCCESS_TTL_MS : RATE_LIMIT_TTL_MS
      const ageMs = Date.now() - cached.at
      if (ageMs < ttl) {
        if (cached.kind === "rate_limited") {
          const remaining = Math.max(
            0,
            Math.ceil((ttl - ageMs) / 1000)
          )
          return jsonRes(
            { ...cached.data, retry_after: remaining },
            429,
            {
              cache: "hit",
              kind: "rate_limited",
              ageSeconds: Math.floor(ageMs / 1000),
              upstream: "skipped",
            }
          )
        }

        const safeCached = sanitizeGraphPayload(cached.data)
        cached.data = safeCached
        return jsonRes(safeCached, cached.status, {
          cache: "hit",
          kind: "success",
          ageSeconds: Math.floor(ageMs / 1000),
          upstream: "skipped",
        })
      }
      __mediaCache.delete(cacheKey)
    }

    let authedUserId: string | null = null
    let authedClient: any = null
    try {
      const authed = await createAuthedClient()
      authedClient = authed
      const userRes = await authed.auth.getUser()
      const user = userRes?.data?.user ?? null
      authedUserId = user?.id ? String(user.id) : null
    } catch {
      authedUserId = null
      authedClient = null
    }

    if (authedUserId && authedClient) {
      const db = await readIgMediaItems({
        authed: authedClient,
        userId: authedUserId,
        igUserId: igBusinessId,
        limit: Number(limit),
        staleMs: DB_STALE_MS,
      })
      if (db.ok && db.isFresh && db.list.length >= Number(limit)) {
        const data = db.list
          .map((row: any) => {
            const raw = row?.raw
            return raw && typeof raw === "object" ? raw : null
          })
          .filter(Boolean)

        if (data.length > 0) {
          const graphLike = {
            data,
            paging: { cursors: { after: null }, next: null },
          }

          enrichVideoThumbsInPlace(graphLike)
          return jsonRes(graphLike, 200, {
            cache: "miss",
            kind: "success",
            ageSeconds: 0,
            upstream: "skipped",
          })
        }
      }
    }

    let pageTokenRes: Response
    try {
      pageTokenRes = await fetchWithTimeout(
        `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
          pageId
        )}?fields=access_token&access_token=${encodeURIComponent(
          userAccessToken
        )}`,
        { cache: "no-store" },
        10_000
      )
    } catch (e: unknown) {
      if (isAbortError(e)) return jsonUpstreamTimeout()
      throw e
    }

    const pageTokenJson = await safeJson(pageTokenRes)

    if (!pageTokenRes.ok || !pageTokenJson?.access_token) {
      const msg = toShortDetail(
        pageTokenJson?.error?.message ??
          pageTokenJson?.message ??
          "failed_to_get_page_access_token"
      )

      if (isRateLimited(pageTokenJson, msg)) {
        const payload = {
          ok: false,
          error: "rate_limited",
          detail: msg,
          retry_after: 120,
        }
        __mediaCache.set(cacheKey, {
          at: Date.now(),
          status: 429,
          data: payload,
          kind: "rate_limited",
        })
        return jsonRes(payload, 429, {
          cache: "miss",
          kind: "rate_limited",
          ageSeconds: 0,
          upstream: "called",
        })
      }

      return jsonRes(
        { ok: false, error: "graph_api_failed", detail: msg },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "called" }
      )
    }

    const pageAccessToken = pageTokenJson.access_token as string

    const fields = [
      "id",
      "caption",
      "media_type",
      "media_url",
      "thumbnail_url",
      "permalink",
      "timestamp",
      "like_count",
      "comments_count",
    ].join(",")

    const mediaUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
        igBusinessId
      )}/media` +
      `?fields=${encodeURIComponent(fields)}` +
      `&limit=${encodeURIComponent(limit)}` +
      (after ? `&after=${encodeURIComponent(after)}` : "") +
      `&access_token=${encodeURIComponent(pageAccessToken)}`

    let mediaRes: Response
    try {
      mediaRes = await fetchWithTimeout(mediaUrl, { cache: "no-store" }, 10_000)
    } catch (e: unknown) {
      if (isAbortError(e)) return jsonUpstreamTimeout()
      throw e
    }
    const mediaJson = await safeJson(mediaRes)

    if (!mediaRes.ok) {
      const msg = toShortDetail(
        mediaJson?.error?.message ??
          mediaJson?.message ??
          "failed_to_fetch_media"
      )

      if (isRateLimited(mediaJson, msg)) {
        const payload = {
          ok: false,
          error: "rate_limited",
          detail: msg,
          retry_after: 120,
        }
        __mediaCache.set(cacheKey, {
          at: Date.now(),
          status: 429,
          data: payload,
          kind: "rate_limited",
        })
        return jsonRes(payload, 429, {
          cache: "miss",
          kind: "rate_limited",
          ageSeconds: 0,
          upstream: "called",
        })
      }

      const status =
        mediaRes.status === 401 || mediaRes.status === 403 ? 403 : 500

      return jsonRes(
        { ok: false, error: "graph_api_failed", detail: msg },
        status,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "called" }
      )
    }

    const safeMediaJson = sanitizeGraphPayload(mediaJson)

    // Enrich missing VIDEO/REELS thumbnails when derivable (pure string transformation; no network)
    enrichVideoThumbsInPlace(safeMediaJson)

    if (authedUserId && authedClient) {
      try {
        const list = Array.isArray((safeMediaJson as any)?.data) ? (safeMediaJson as any).data : []
        const rows = list
          .map((it: any) => {
            const id = typeof it?.id === "string" ? it.id.trim() : ""
            if (!id) return null
            return {
              user_id: authedUserId,
              ig_user_id: igBusinessId,
              media_id: id,
              media_type: typeof it?.media_type === "string" ? it.media_type : null,
              permalink: typeof it?.permalink === "string" ? it.permalink : null,
              caption: typeof it?.caption === "string" ? it.caption : null,
              taken_at: typeof it?.timestamp === "string" ? it.timestamp : null,
              thumbnail_url: typeof it?.thumbnail_url === "string" ? it.thumbnail_url : null,
              media_url: typeof it?.media_url === "string" ? it.media_url : null,
              like_count: typeof it?.like_count === "number" ? Math.floor(it.like_count) : it?.like_count != null ? Math.floor(Number(it.like_count)) : null,
              comments_count:
                typeof it?.comments_count === "number"
                  ? Math.floor(it.comments_count)
                  : it?.comments_count != null
                    ? Math.floor(Number(it.comments_count))
                    : null,
              raw: it ?? null,
            }
          })
          .filter(Boolean)

        await upsertIgMediaItems({ authed: authedClient, rows: rows as any })
      } catch {
        // swallow
      }
    }

    const dataLen = safeLen((safeMediaJson as any)?.data)
    if (dataLen > 0) {
      __mediaCache.set(cacheKey, {
        at: Date.now(),
        status: 200,
        data: safeMediaJson,
        kind: "success",
      })
    }

    return jsonRes(safeMediaJson, 200, {
      cache: "miss",
      kind: "success",
      ageSeconds: 0,
      upstream: "called",
    })
  } catch (err: any) {
    return jsonError(
      "server_error",
      { message: err?.message ?? String(err) },
      500
    )
  }
}
