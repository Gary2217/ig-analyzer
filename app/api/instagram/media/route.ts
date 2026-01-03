import { NextResponse } from "next/server";

const GRAPH_VERSION = "v24.0";
const PAGE_ID = "851912424681350";
const IG_BUSINESS_ID = "17841404364250644";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache for rate-limit mitigation
// ─────────────────────────────────────────────────────────────────────────────
type MediaCacheEntry = {
  at: number
  status: number
  data: any
  kind: "success" | "rate_limited"
}

const SUCCESS_TTL_MS = 600 * 1000      // 10 minutes
const RATE_LIMIT_TTL_MS = 120 * 1000   // 2 minutes cooldown

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
// Rate-limit detection
// ─────────────────────────────────────────────────────────────────────────────
function isRateLimited(body: any, detail: string): boolean {
  // Use Number() to handle both string "4" and number 4
  const code = Number(body?.error?.code ?? body?.code)
  const subcode = Number(body?.error?.error_subcode ?? body?.error_subcode)

  // Build combined message from all possible fields
  const combinedMsg = [
    body?.error?.message,
    body?.message,
    body?.error?.error_user_msg,
    body?.error?.error_user_title,
    detail,
  ]
    .filter((s) => typeof s === "string" && s)
    .join(" ")
    .toLowerCase()

  // Detect rate limit via:
  // - error code 4 (FB/IG standard rate limit code)
  // - error subcode 4
  // - message containing "(#4)" pattern
  // - message containing "application request limit reached"
  return (
    code === 4 ||
    subcode === 4 ||
    combinedMsg.includes("(#4)") ||
    combinedMsg.includes("application request limit reached")
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getCookieValue(cookie: string, key: string) {
  const re = new RegExp(`${key}=([^;]+)`)
  const m = cookie.match(re)
  if (!m?.[1]) return ""
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

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
  const redacted = trimmed.replace(/access_token=([^&\s]+)/gi, "access_token=REDACTED")
  // Avoid long payload-like messages.
  return redacted.length > 180 ? `${redacted.slice(0, 180)}…` : redacted
}

function stripAccessTokenFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr)
    if (u.searchParams.has("access_token")) u.searchParams.delete("access_token")
    return u.toString()
  } catch {
    return null
  }
}

function sanitizeGraphPayload<T>(payload: T): T {
  let safe: any
  try {
    safe = typeof (globalThis as any).structuredClone === "function"
      ? (globalThis as any).structuredClone(payload)
      : JSON.parse(JSON.stringify(payload))
  } catch {
    safe = JSON.parse(JSON.stringify(payload))
  }

  if (safe?.paging?.next && typeof safe.paging.next === "string") {
    const stripped = stripAccessTokenFromUrl(safe.paging.next)
    if (stripped) safe.paging.next = stripped
    else safe.paging.next = null
  }

  return safe
}

function jsonError(message: string, extra?: any, status = 400) {
  return jsonRes(
    { ...extra, error: message },
    status,
    { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" },
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const after = url.searchParams.get("after") || "";
    const limit = url.searchParams.get("limit") || "25";

    // 1) 從 cookie 取得 User Access Token（注意名稱）
    const cookie = req.headers.get("cookie") || "";
    const userAccessToken = getCookieValue(cookie, "ig_access_token");
    const igIdFromCookie = getCookieValue(cookie, "ig_ig_id");
    const pageIdFromCookie = getCookieValue(cookie, "ig_page_id");

     const hasAccessToken = Boolean(userAccessToken)
     const hasIgId = Boolean(igIdFromCookie)
     const hasPageId = Boolean(pageIdFromCookie)

    if (!userAccessToken) {
      console.warn("[media-route] fail", {
        status: 403,
        error: "missing_cookie:ig_access_token",
        detail: null,
        hasAccessToken,
        hasIgId,
        hasPageId,
      })
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_access_token", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" },
      )
    }

    // Require IDs to be present in cookies to prevent accidental 403 spam from unstable connection state.
    if (!igIdFromCookie) {
      console.warn("[media-route] fail", {
        status: 403,
        error: "missing_cookie:ig_ig_id",
        detail: null,
        hasAccessToken,
        hasIgId,
        hasPageId,
      })
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_ig_id", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" },
      )
    }
    if (!pageIdFromCookie) {
      console.warn("[media-route] fail", {
        status: 403,
        error: "missing_cookie:ig_page_id",
        detail: null,
        hasAccessToken,
        hasIgId,
        hasPageId,
      })
      return jsonRes(
        { ok: false, error: "missing_cookie:ig_page_id", detail: null },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "skipped" },
      )
    }

    // Use cookie IDs as the source of truth.
    const igBusinessId = igIdFromCookie
    const pageId = pageIdFromCookie

    // ───────────────────────────────────────────────────────────────────────
    // Cache-first: check before calling upstream
    // ───────────────────────────────────────────────────────────────────────
    const cacheKey = `${igBusinessId}:${pageId}`
    const cached = __mediaCache.get(cacheKey)
    if (cached) {
      const ttl = cached.kind === "success" ? SUCCESS_TTL_MS : RATE_LIMIT_TTL_MS
      const ageMs = Date.now() - cached.at
      if (ageMs < ttl) {
        if (cached.kind === "rate_limited") {
          const remaining = Math.max(0, Math.ceil((ttl - ageMs) / 1000))
          return jsonRes(
            { ...cached.data, retry_after: remaining },
            429,
            { cache: "hit", kind: "rate_limited", ageSeconds: Math.floor(ageMs / 1000), upstream: "skipped" },
          )
        }
        const safeCached = sanitizeGraphPayload(cached.data)
        cached.data = safeCached
        return jsonRes(
          safeCached,
          cached.status,
          { cache: "hit", kind: "success", ageSeconds: Math.floor(ageMs / 1000), upstream: "skipped" },
        )
      }
      __mediaCache.delete(cacheKey)
    }

    // 2) 使用 User token 換 Page Access Token
    const pageTokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(
        userAccessToken
      )}`,
      { cache: "no-store" }
    );

    const pageTokenJson = await safeJson(pageTokenRes);

    if (!pageTokenRes.ok || !pageTokenJson?.access_token) {
      const msg = toShortDetail(
        typeof pageTokenJson?.error?.message === "string"
          ? pageTokenJson.error.message
          : typeof pageTokenJson?.message === "string"
            ? pageTokenJson.message
            : "failed_to_get_page_access_token",
      )

      // Check for rate limit
      if (isRateLimited(pageTokenJson, msg)) {
        const payload = { ok: false, error: "rate_limited", detail: msg, retry_after: 120 }
        __mediaCache.set(cacheKey, { at: Date.now(), status: 429, data: payload, kind: "rate_limited" })
        console.warn("[media-route] fail", {
          status: 429,
          error: "rate_limited",
          detail: msg,
          hasAccessToken,
          hasIgId,
          hasPageId,
        })
        return jsonRes(payload, 429, { cache: "miss", kind: "rate_limited", ageSeconds: 0, upstream: "called" })
      }

      console.warn("[media-route] fail", {
        status: 403,
        error: "graph_api_failed",
        detail: msg,
        hasAccessToken,
        hasIgId,
        hasPageId,
      })
      return jsonRes(
        { ok: false, error: "graph_api_failed", detail: msg },
        403,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "called" },
      )
    }

    const pageAccessToken = pageTokenJson.access_token as string;

    // 3) 使用 Page token 取得 IG media（支援 paging）
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
    ].join(",");

    const mediaUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igBusinessId)}/media` +
      `?fields=${encodeURIComponent(fields)}` +
      `&limit=${encodeURIComponent(limit)}` +
      (after ? `&after=${encodeURIComponent(after)}` : "") +
      `&access_token=${encodeURIComponent(pageAccessToken)}`;

    const mediaRes = await fetch(mediaUrl, { cache: "no-store" });
    const mediaJson = await safeJson(mediaRes);

    if (!mediaRes.ok) {
      const msg = toShortDetail(
        typeof mediaJson?.error?.message === "string"
          ? mediaJson.error.message
          : typeof mediaJson?.message === "string"
            ? mediaJson.message
            : "failed_to_fetch_media",
      )

      // Check for rate limit
      if (isRateLimited(mediaJson, msg)) {
        const payload = { ok: false, error: "rate_limited", detail: msg, retry_after: 120 }
        __mediaCache.set(cacheKey, { at: Date.now(), status: 429, data: payload, kind: "rate_limited" })
        console.warn("[media-route] fail", {
          status: 429,
          error: "rate_limited",
          detail: msg,
          hasAccessToken,
          hasIgId,
          hasPageId,
        })
        return jsonRes(payload, 429, { cache: "miss", kind: "rate_limited", ageSeconds: 0, upstream: "called" })
      }

      const status = mediaRes.status === 401 || mediaRes.status === 403 ? 403 : 500
      console.warn("[media-route] fail", {
        status,
        error: "graph_api_failed",
        detail: msg,
        hasAccessToken,
        hasIgId,
        hasPageId,
      })
      return jsonRes(
        { ok: false, error: "graph_api_failed", detail: msg },
        status,
        { cache: "miss", kind: "none", ageSeconds: 0, upstream: "called" },
      )
    }

    // Success: cache and return
    const safeMediaJson = sanitizeGraphPayload(mediaJson)
    __mediaCache.set(cacheKey, { at: Date.now(), status: 200, data: safeMediaJson, kind: "success" })
    return jsonRes(safeMediaJson, 200, { cache: "miss", kind: "success", ageSeconds: 0, upstream: "called" });
  } catch (err: any) {
    return jsonError(
      "server_error",
      { message: err?.message ?? String(err) },
      500
    );
  }
}
