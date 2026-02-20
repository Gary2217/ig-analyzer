import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { __thumbCache, THUMB_TTL_MS, THUMB_CACHE_MAX, THUMB_BUCKET, THUMB_TABLE, type ThumbCacheEntry } from "./_lib/cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// ---------------------------------------------------------------------------
// Supabase admin client (service role, server-only, lazy init)
// ---------------------------------------------------------------------------
const STORE_TTL_DAYS = 7
const STORE_TTL_FAIL_MINUTES = 30

let __supabaseAdmin: SupabaseClient | null = null
let __supabaseAdminMissing = false

function getSupabaseAdmin(): SupabaseClient | null {
  if (__supabaseAdminMissing) return null
  if (__supabaseAdmin) return __supabaseAdmin
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  if (!url || !key) {
    __supabaseAdminMissing = true
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ig-thumb] Supabase env missing — persistent cache disabled")
    }
    return null
  }
  __supabaseAdmin = createClient(url, key, { auth: { persistSession: false } })
  return __supabaseAdmin
}

function urlHash(originalUrl: string): string {
  return createHash("sha256").update(originalUrl).digest("hex")
}

function storagePath(hash: string): string {
  return `${hash}.bin`
}

// Read from DB (inline bytes preferred) or Storage. Returns ArrayBuffer + contentType, or null on miss/error.
async function readStoreCache(hash: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const sb = getSupabaseAdmin()
  if (!sb) return null
  try {
    const { data: row, error: dbErr } = await sb
      .from(THUMB_TABLE)
      .select("storage_path, content_type, expires_at, inline_bytes")
      .eq("url_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()
    if (dbErr || !row) return null

    // Fire-and-forget: update last_accessed_at
    sb.from(THUMB_TABLE)
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("url_hash", hash)
      .then(() => {})

    // Fast path: inline bytes stored in DB row (no Storage round-trip)
    if (row.inline_bytes) {
      const body = Buffer.from(row.inline_bytes as string, "base64").buffer as ArrayBuffer
      return { body, contentType: row.content_type as string }
    }

    // Slow path: download from Storage
    const { data: blob, error: storErr } = await sb.storage
      .from(THUMB_BUCKET)
      .download(row.storage_path)
    if (storErr || !blob) return null

    const body = await blob.arrayBuffer()
    return { body, contentType: row.content_type as string }
  } catch {
    return null
  }
}

// Write bytes to Supabase Storage + upsert DB row. Fire-and-forget safe.
async function writeStoreCache(params: {
  hash: string
  originalUrl: string
  path: string
  contentType: string
  body: ArrayBuffer
  upstreamStatus: number
  ttlDays?: number
}): Promise<void> {
  const sb = getSupabaseAdmin()
  if (!sb) return
  const { hash, originalUrl, path, contentType, body, upstreamStatus, ttlDays = STORE_TTL_DAYS } = params
  try {
    const { error: upErr } = await sb.storage
      .from(THUMB_BUCKET)
      .upload(path, body, { contentType, upsert: true })
    if (upErr) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ig-thumb] storage upload failed", upErr.message)
      }
      return
    }
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    const INLINE_MAX_BYTES = 512 * 1024
    const inlineBytes = body.byteLength <= INLINE_MAX_BYTES
      ? Buffer.from(body).toString("base64")
      : null
    await sb.from(THUMB_TABLE).upsert({
      url_hash: hash,
      original_url: originalUrl,
      storage_path: path,
      content_type: contentType,
      bytes_size: body.byteLength,
      upstream_status: upstreamStatus,
      expires_at: expiresAt,
      last_accessed_at: new Date().toISOString(),
      inline_bytes: inlineBytes,
    }, { onConflict: "url_hash" })
  } catch {
    // best-effort; never throw
  }
}

// ---------------------------------------------------------------------------
// TTL cache (serverless best-effort; survives within the same warm instance)
// ---------------------------------------------------------------------------

function thumbCacheKey(url: string): string {
  return `thumb|${url}`
}

function readThumbCache(key: string): ThumbCacheEntry | null {
  const e = __thumbCache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > THUMB_TTL_MS) {
    __thumbCache.delete(key)
    return null
  }
  return e
}

function writeThumbCache(key: string, entry: ThumbCacheEntry) {
  __thumbCache.set(key, entry)
  if (__thumbCache.size > THUMB_CACHE_MAX) {
    const items = Array.from(__thumbCache.entries()).sort((a, b) => a[1].ts - b[1].ts)
    const removeN = Math.max(1, __thumbCache.size - THUMB_CACHE_MAX)
    for (let i = 0; i < removeN; i++) {
      const k = items[i]?.[0]
      if (k) __thumbCache.delete(k)
    }
  }
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffMs(attempt: number): number {
  const base = Math.min(200 * Math.pow(2, attempt), 1200)
  const jitter = Math.random() * 150
  return Math.floor(base + jitter)
}

function shouldRetry(status: number): boolean {
  if (status === 403 || status === 404) return false
  return status === 429 || status >= 500
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxAttempts: number,
): Promise<{ res: Response; attempts: number }> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1))
    const ac = new AbortController()
    const tid = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ac.signal })
      clearTimeout(tid)
      if (res.ok || !shouldRetry(res.status)) {
        return { res, attempts: attempt + 1 }
      }
      lastErr = new Error(`upstream ${res.status}`)
    } catch (e) {
      clearTimeout(tid)
      lastErr = e
      // Don't retry on abort (timeout) if it's the last attempt
      if (attempt === maxAttempts - 1) throw e
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// SVG placeholder (returned as image/svg+xml on all failure paths)
// ---------------------------------------------------------------------------
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="#1a1a1a"/></svg>`
const PLACEHOLDER_BYTES = new TextEncoder().encode(PLACEHOLDER_SVG)

function placeholderResponse(extraHeaders?: Record<string, string>): Response {
  return new Response(PLACEHOLDER_BYTES, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "no-store",
      "x-thumb-fallback": "1",
      ...extraHeaders,
    },
  })
}

const __thumbInflight = new Map<string, Promise<Response>>()

const __thumbDebugLogSet = new Set<string>()
const __THUMB_DEBUG_LOG_MAX = 50

// Whitelist of allowed CDN hostnames (for final redirect validation)
// Includes all Instagram/Facebook CDN patterns commonly used in production
const ALLOWED_CDN_HOSTNAMES = [
  "cdninstagram.com",
  "igcdn.com",
  "fbcdn.net",
  "fna.fbcdn.net",
  "fbsbx.com",
  "akamaihd.net",
]

function isPrivateOrLocalHostname(hostnameRaw: string): boolean {
  const h = String(hostnameRaw || "").toLowerCase().replace(/\.$/, "")
  if (!h) return true
  if (h === "localhost" || h.endsWith(".localhost")) return true
  if (h === "0.0.0.0") return true
  if (h === "::1") return true

  // Block obvious private IPv4 ranges.
  // Note: we intentionally do NOT do DNS resolution here.
  const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)
  if (!ipv4) return false

  const parts = h.split(".").map((x) => Number(x))
  if (parts.length !== 4) return true
  if (parts.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return true

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

// Regex for Instagram media path: /(p|reel|tv)/{shortcode}/media/
const INSTAGRAM_MEDIA_PATH_REGEX = /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/media\/$/

function stripUrlQueryAndHash(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    u.search = ""
    u.hash = ""
    return u.toString()
  } catch {
    return ""
  }
}

function isInstagramHostname(hostnameRaw: string): boolean {
  const h = String(hostnameRaw || "").toLowerCase().replace(/\.$/, "")
  return h === "instagram.com" || h.endsWith(".instagram.com") || h === "instagr.am"
}

function logThumbDebugOnce(enabled: boolean, key: string, payload: Record<string, unknown>) {
  if (!enabled) return
  if (__thumbDebugLogSet.size >= __THUMB_DEBUG_LOG_MAX) return
  if (__thumbDebugLogSet.has(key)) return
  __thumbDebugLogSet.add(key)
  // eslint-disable-next-line no-console
  console.debug("[ig-thumb:debug]", payload)
}

function isAllowedImageUrl(url: string): { allowed: boolean; host: string; reason: string } {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "")

    // Must be http or https
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { allowed: false, host: hostname, reason: "bad_protocol" }
    }

    if (isPrivateOrLocalHostname(hostname)) {
      return { allowed: false, host: hostname, reason: "private_host" }
    }

    // Allow CDN domains (cdninstagram.com, fbcdn.net and subdomains)
    const isCDN = ALLOWED_CDN_HOSTNAMES.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
    if (isCDN) {
      return { allowed: true, host: hostname, reason: "cdn" }
    }

    // Allow instagram.com domain variants ONLY for /media/ paths
    if (isInstagramHostname(hostname)) {
      const ok = INSTAGRAM_MEDIA_PATH_REGEX.test(parsed.pathname)
      return { allowed: ok, host: hostname, reason: ok ? "ig_media" : "ig_non_media_path" }
    }

    return { allowed: false, host: hostname, reason: "not_allowlisted" }
  } catch {
    return { allowed: false, host: "", reason: "parse_error" }
  }
}

function isCDNHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "") // strip trailing dot
  if (isPrivateOrLocalHostname(lower)) return false
  return ALLOWED_CDN_HOSTNAMES.some(allowed => 
    lower === allowed || lower.endsWith(`.${allowed}`)
  )
}


const FETCH_INIT: RequestInit = {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.instagram.com/",
    "Origin": "https://www.instagram.com",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  },
  cache: "no-store",
  redirect: "follow",
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const thumbnailUrl = searchParams.get("url")
    const debugThumbEnabled = searchParams.get("debugThumb") === "1"

    if (!thumbnailUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    let initialUrlObj: URL
    try {
      initialUrlObj = new URL(thumbnailUrl)
    } catch {
      return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 })
    }

    // Validate URL is from allowed Instagram/FB CDN
    const allowCheck = isAllowedImageUrl(thumbnailUrl)
    if (!allowCheck.allowed) {
      logThumbDebugOnce(debugThumbEnabled, `blocked:${allowCheck.host}:${allowCheck.reason}`, {
        kind: "blocked",
        inputUrlHost: allowCheck.host,
        reason: allowCheck.reason,
      })
      return placeholderResponse({
        "x-thumb-reason": `blocked_${allowCheck.reason}`,
        "x-thumb-host": allowCheck.host,
        "x-thumb-allowed": "0",
      })
    }

    const normalizedUrlKey = initialUrlObj.toString()
    const cacheKey = thumbCacheKey(normalizedUrlKey)
    const hash = urlHash(normalizedUrlKey)
    const sPath = storagePath(hash)

    // --- L1: memory cache HIT ---
    const cached = readThumbCache(cacheKey)
    if (cached) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "content-type": cached.contentType,
          "cache-control": "no-store",
          "x-thumb-cache": "HIT",
          "x-thumb-store": "L1",
          "x-thumb-attempts": "0",
          "x-thumb-host": allowCheck.host,
          "x-thumb-allowed": "1",
        },
      })
    }

    // --- Inflight dedup ---
    const existing = __thumbInflight.get(normalizedUrlKey)
    if (existing) {
      const shared = await existing
      return shared.clone()
    }

    // --- Fetch with retry (with L2 store check inside) ---
    const run = (async (): Promise<Response> => {
      try {
        // L2: Supabase persistent cache
        const stored = await readStoreCache(hash)
        if (stored) {
          writeThumbCache(cacheKey, { ts: Date.now(), status: 200, contentType: stored.contentType, body: stored.body })
          return new Response(stored.body, {
            status: 200,
            headers: {
              "content-type": stored.contentType,
              "cache-control": "no-store",
              "x-thumb-cache": "MISS",
              "x-thumb-store": "HIT",
              "x-thumb-attempts": "0",
              "x-thumb-host": allowCheck.host,
              "x-thumb-allowed": "1",
            },
          })
        }

        // L3: upstream fetch with retry
        let imageResponse: Response
        let attempts: number
        try {
          const result = await fetchWithRetry(thumbnailUrl, FETCH_INIT, 6_000, 3)
          imageResponse = result.res
          attempts = result.attempts
        } catch (fetchError) {
          const isTimeout = fetchError instanceof Error && fetchError.name === "AbortError"
          logThumbDebugOnce(
            debugThumbEnabled,
            `fetch_error:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${isTimeout ? "timeout" : "network"}`,
            { kind: "fetch_error", inputUrlHost: initialUrlObj.hostname, errorReason: isTimeout ? "timeout" : "network_error" },
          )
          return placeholderResponse({ "x-thumb-reason": isTimeout ? "timeout" : "network_error" })
        }

        // Verify final response URL (after redirects)
        const finalUrl = imageResponse.url
        let finalHostname = ""
        let finalPathname = ""
        try {
          const finalParsed = new URL(finalUrl)
          finalHostname = finalParsed.hostname.toLowerCase()
          finalPathname = finalParsed.pathname || ""
        } catch {
          return placeholderResponse({ "x-thumb-reason": "invalid_final_url" })
        }

        const contentType = imageResponse.headers.get("content-type") || ""
        const isFinalInstagramMediaImage =
          isInstagramHostname(finalHostname) &&
          INSTAGRAM_MEDIA_PATH_REGEX.test(finalPathname) &&
          contentType.startsWith("image/")

        if (!isCDNHostname(finalHostname) && !isFinalInstagramMediaImage) {
          logThumbDebugOnce(
            debugThumbEnabled,
            `final_host_blocked:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${finalHostname}`,
            { kind: "final_hostname_blocked", inputUrlHost: initialUrlObj.hostname, finalHostname },
          )
          return placeholderResponse({ "x-thumb-reason": "final_hostname_blocked" })
        }

        if (!imageResponse.ok) {
          logThumbDebugOnce(
            debugThumbEnabled,
            `upstream_error:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${imageResponse.status}`,
            { kind: "upstream_error", inputUrlHost: initialUrlObj.hostname, upstreamStatus: imageResponse.status },
          )
          return placeholderResponse({ "x-thumb-reason": `upstream_${imageResponse.status}` })
        }

        if (!contentType.startsWith("image/")) {
          logThumbDebugOnce(
            debugThumbEnabled,
            `non_image:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${contentType.slice(0, 64)}`,
            { kind: "non_image", inputUrlHost: initialUrlObj.hostname, finalContentType: contentType },
          )
          return placeholderResponse({ "x-thumb-reason": "non_image" })
        }

        // Success — read bytes, write L1 + L2 (awaited; failure does not fail request)
        const imageBuffer = await imageResponse.arrayBuffer()
        writeThumbCache(cacheKey, { ts: Date.now(), status: 200, contentType, body: imageBuffer })

        let storeWriteFailed = false
        try {
          await writeStoreCache({
            hash, originalUrl: normalizedUrlKey, path: sPath,
            contentType, body: imageBuffer, upstreamStatus: 200,
          })
        } catch {
          storeWriteFailed = true
          if (process.env.NODE_ENV !== "production") {
            console.warn("[ig-thumb] store write failed for", stripUrlQueryAndHash(normalizedUrlKey))
          }
        }

        const respHeaders: Record<string, string> = {
          "content-type": contentType,
          "cache-control": "no-store",
          "x-thumb-cache": "MISS",
          "x-thumb-store": storeWriteFailed ? "MISS_WRITE_FAILED" : "MISS_WRITE",
          "x-thumb-store-write": storeWriteFailed ? "FAILED" : "OK",
          "x-thumb-attempts": String(attempts),
          "x-thumb-host": allowCheck.host,
          "x-thumb-allowed": "1",
        }
        const contentLength = imageResponse.headers.get("content-length")
        if (contentLength) respHeaders["content-length"] = contentLength

        return new Response(imageBuffer, { status: 200, headers: respHeaders })
      } finally {
        __thumbInflight.delete(normalizedUrlKey)
      }
    })()

    __thumbInflight.set(normalizedUrlKey, run)
    return run
  } catch (error) {
    console.error("Thumbnail proxy error:", error)
    return placeholderResponse({ "x-thumb-reason": "internal_error" })
  }
}
