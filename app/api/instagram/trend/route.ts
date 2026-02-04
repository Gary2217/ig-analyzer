import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// NOTE:
// - Do NOT request "impressions" here. Many IG Graph contexts reject it with (#100).
// - Ensure we ALWAYS return non-empty points when media exists by falling back to
//   like_count/comments_count aggregation if insights are unavailable.

const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// Copied from app/api/instagram/media/route.ts (do not redesign OAuth here)
const PAGE_ID = "851912424681350"
const IG_BUSINESS_ID = "17841404364250644"

const __DEV__ = process.env.NODE_ENV !== "production"

type CacheEntry<T> = { at: number; ttl: number; value: T }

async function buildFallbackPointsCached(params: {
  origin: string
  days: number
  ig_id: string
  page_id: string
  token: string
  rawCookieHeader: string
}): Promise<{ points: TrendPoint[]; cacheState: "hit" | "miss" | "inflight" }> {
  const key = `trend_fb|ig:${params.ig_id}|pg:${params.page_id}|days:${params.days}|tok:${tokenSig(params.token)}`
  const cached = readCache(__trendFallbackCache, key)
  if (cached) return { points: cached, cacheState: "hit" }

  const inflight = __trendFallbackInflight.get(key)
  if (inflight) {
    const pts = await inflight
    return { points: pts, cacheState: "inflight" }
  }

  const run = (async () => {
    const mediaUrl = `${params.origin}/api/instagram/media`
    const mediaRes = await fetch(mediaUrl, {
      method: "GET",
      cache: "no-store",
      headers: { cookie: params.rawCookieHeader },
    })
    const mediaBody = await safeJson(mediaRes)
    const list = Array.isArray(mediaBody?.data) ? (mediaBody.data as FallbackMediaItem[]) : []

    const untilMs2 = Date.now()
    const sinceMs2 = untilMs2 - (params.days - 1) * 24 * 60 * 60 * 1000
    const byDay = new Map<number, TrendPoint>()

    for (const item of list) {
      const ts = typeof item?.timestamp === "string" ? item.timestamp : ""
      if (!ts) continue
      const ms = Date.parse(ts)
      if (!Number.isFinite(ms)) continue
      if (ms < sinceMs2 || ms > untilMs2) continue

      const key2 = startOfDayMsUTC(ms)
      const likes = Number(item?.like_count || 0) || 0
      const comments = Number(item?.comments_count || 0) || 0
      const interactions = likes + comments

      const prev = byDay.get(key2)
      if (prev) prev.impressions = (prev.impressions || 0) + interactions
      else {
        byDay.set(key2, { ts: key2, reach: null, impressions: interactions, engaged: null, followerDelta: null })
      }
    }

    const pts = Array.from(byDay.values()).sort((a, b) => a.ts - b.ts)
    writeCache(__trendFallbackCache, key, pts, 12_000)
    pruneOldest(__trendFallbackCache, 200)
    return pts
  })()

  __trendFallbackInflight.set(key, run)
  try {
    const pts = await run
    return { points: pts, cacheState: "miss" }
  } finally {
    __trendFallbackInflight.delete(key)
  }
}
type TrendResponse = { ok: true; days: number; points: TrendPoint[] }

type TrendResponseCached = {
  out: TrendResponse
  insightsCacheState: "hit" | "miss" | "inflight"
  fallbackCacheState: "hit" | "miss" | "inflight" | "skip"
}

const __trendInflight = new Map<string, Promise<TrendResponseCached>>()
const __trendCache = new Map<string, CacheEntry<TrendResponseCached>>()

const __trendPageTokenCache = new Map<string, CacheEntry<string>>()
const __trendPageTokenInflight = new Map<string, Promise<string>>()

const __trendInsightsCache = new Map<string, CacheEntry<{ ok: boolean; data: any[]; body: any }>>()
const __trendInsightsInflight = new Map<string, Promise<{ ok: boolean; data: any[]; body: any }>>()

const __trendFallbackCache = new Map<string, CacheEntry<TrendPoint[]>>()
const __trendFallbackInflight = new Map<string, Promise<TrendPoint[]>>()

function nowMs() {
  return Date.now()
}

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const e = map.get(key)
  if (!e) return null
  if (nowMs() - e.at > e.ttl) {
    map.delete(key)
    return null
  }
  return e.value
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  map.set(key, { at: nowMs(), ttl, value })
}

function pruneOldest<T>(map: Map<string, CacheEntry<T>>, maxEntries: number) {
  if (map.size <= maxEntries) return
  const items = Array.from(map.entries())
  items.sort((a, b) => a[1].at - b[1].at)
  const removeN = Math.max(1, map.size - maxEntries)
  for (let i = 0; i < removeN; i++) {
    const k = items[i]?.[0]
    if (k) map.delete(k)
  }
}

async function fetchInsightsCached(params: {
  ig_id: string
  since: number
  until: number
  metricList: string[]
  pageToken: string
}): Promise<{ ok: boolean; data: any[]; body: any; cacheState: "hit" | "miss" | "inflight" }> {
  const metricsKey = params.metricList.join(",")
  const key =
    `trend_ins|ig:${params.ig_id}|since:${params.since}|until:${params.until}` +
    `|m:${metricsKey}|pt:${tokenSig(params.pageToken)}`

  const cached = readCache(__trendInsightsCache, key)
  if (cached) return { ...cached, cacheState: "hit" }

  const inflight = __trendInsightsInflight.get(key)
  if (inflight) {
    const out = await inflight
    return { ...out, cacheState: "inflight" }
  }

  const run = (async () => {
    const url =
      `${GRAPH_BASE}/${encodeURIComponent(params.ig_id)}/insights` +
      `?metric=${encodeURIComponent(metricsKey)}` +
      `&metric_type=total_value` +
      `&period=day` +
      `&since=${encodeURIComponent(String(params.since))}` +
      `&until=${encodeURIComponent(String(params.until))}` +
      `&access_token=${encodeURIComponent(params.pageToken)}`

    let body: any = null
    let ok = false
    let data: any[] = []
    try {
      const res = await fetch(url, { cache: "no-store" })
      body = await safeJson(res)
      ok = Boolean(res.ok)
      data = Array.isArray(body?.data) ? body.data : []
    } catch {
      ok = false
      data = []
      body = null
    }

    const out = { ok, data, body }
    writeCache(__trendInsightsCache, key, out, 20_000)
    pruneOldest(__trendInsightsCache, 200)
    return out
  })()

  __trendInsightsInflight.set(key, run)
  try {
    const out = await run
    return { ...out, cacheState: "miss" }
  } finally {
    __trendInsightsInflight.delete(key)
  }
}

function tokenSig(raw: string) {
  const t = String(raw || "").trim()
  if (!t) return ""
  try {
    return createHash("sha256").update(t).digest("hex").slice(0, 16)
  } catch {
    return "sha_err"
  }
}

async function getPageTokenCached(params: { page_id: string; token: string }): Promise<string> {
  const key = `trend_pt|pg:${params.page_id}|tok:${tokenSig(params.token)}`
  const cached = readCache(__trendPageTokenCache, key)
  if (cached) return cached

  const inflight = __trendPageTokenInflight.get(key)
  if (inflight) return await inflight

  const run = (async () => {
    const pageTokenUrl =
      `${GRAPH_BASE}/${encodeURIComponent(params.page_id)}` +
      `?fields=access_token&access_token=${encodeURIComponent(params.token)}`
    const pageTokenRes = await fetch(pageTokenUrl, { cache: "no-store" })
    const pageTokenBody = await safeJson(pageTokenRes)

    if (!pageTokenRes.ok || !pageTokenBody?.access_token) {
      const err: any = new Error("failed_to_get_page_access_token")
      err.upstreamStatus = pageTokenRes.status
      err.upstreamBody = pageTokenBody
      throw err
    }

    const pageToken = pageTokenBody.access_token as string
    writeCache(__trendPageTokenCache, key, pageToken, 55_000)
    pruneOldest(__trendPageTokenCache, 200)
    return pageToken
  })()

  __trendPageTokenInflight.set(key, run)
  try {
    return await run
  } finally {
    __trendPageTokenInflight.delete(key)
  }
}

type TrendPoint = {
  ts: number
  reach: number | null
  impressions: number | null
  engaged: number | null
  followerDelta: null
}

type FallbackMediaItem = {
  timestamp?: string
  like_count?: number
  comments_count?: number
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function jsonError(message: string, extra?: any, status = 400) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

function clampDays(raw: string | null) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 365
  const i = Math.floor(n)
  if (i < 2) return 2
  if (i > 365) return 365
  return i
}

function toUnixSeconds(ms: number) {
  return Math.floor(ms / 1000)
}

function startOfDayMs(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfDayMsUTC(ms: number) {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
}

function getCookieValueFromHeader(cookie: string, key: string) {
  const re = new RegExp(`${key}=([^;]+)`)
  const m = cookie.match(re)
  if (!m?.[1]) return ""
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function toNullableNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isInvalidMetricError(body: any) {
  const msg = body?.error?.message || body?.error?.error?.message
  return typeof msg === "string" && msg.includes("metric[") && msg.includes("must be one of the following values")
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))

    let c: any = null
    try {
      // Next.js 新版 cookies() 可能是 async
      c = await (cookies() as any)
    } catch {
      // ignore; will fallback to header parsing below
      c = null
    }
    const rawCookieHeader = req.headers.get("cookie") || ""

    // [OK] 先用 next/headers cookies()（正規）
    // ⚠️ 這三個 key 名稱「必須」跟 app/api/instagram/media/route.ts 一致
    const tokenFromCookies = typeof c?.get === "function" ? c.get("ig_access_token")?.value || "" : ""
    const pageIdFromCookies = typeof c?.get === "function" ? c.get("ig_page_id")?.value || "" : ""
    const igIdFromCookies = typeof c?.get === "function" ? c.get("ig_ig_id")?.value || "" : ""

    // [OK] 再用 header regex 當 fallback（避免 cookie() 取不到）
    const tokenFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_access_token")
    const pageIdFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_page_id")
    const igIdFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_ig_id")

    const token = tokenFromCookies || tokenFromHeader
    const page_id =
      process.env.NODE_ENV === "production" ? pageIdFromCookies || pageIdFromHeader : pageIdFromCookies || pageIdFromHeader || PAGE_ID
    const ig_id =
      process.env.NODE_ENV === "production" ? igIdFromCookies || igIdFromHeader : igIdFromCookies || igIdFromHeader || IG_BUSINESS_ID

    const missing: string[] = []
    if (!token) missing.push("token")
    if (!page_id) missing.push("page_id")
    if (!ig_id) missing.push("ig_id")
    if (missing.length) {
      return jsonError(
        "missing_auth",
        { missing, hint: "login via /api/auth/instagram first" },
        401,
      )
    }

    // ---- response-level inflight + short TTL cache (no contract change) ----
    const cacheKey = `trend|ig:${ig_id}|pg:${page_id}|days:${days}|tok:${tokenSig(token)}`

    const cached = readCache(__trendCache, cacheKey)
    if (cached) {
      const headers: Record<string, string> = { "Cache-Control": "no-store" }
      if (__DEV__) headers["X-TR-Cache"] = "hit"
      if (__DEV__) headers["X-TR-INS"] = cached.insightsCacheState
      if (__DEV__) headers["X-TR-FB"] = cached.fallbackCacheState
      return NextResponse.json(cached.out, { status: 200, headers })
    }

    const inflight = __trendInflight.get(cacheKey)
    if (inflight) {
      const out = await inflight
      const headers: Record<string, string> = { "Cache-Control": "no-store" }
      if (__DEV__) headers["X-TR-Cache"] = "inflight"
      if (__DEV__) headers["X-TR-INS"] = out.insightsCacheState
      if (__DEV__) headers["X-TR-FB"] = out.fallbackCacheState
      return NextResponse.json(out.out, { status: 200, headers })
    }

    let pageToken = ""
    let pageTokenCacheState: "hit" | "miss" | "inflight" = "miss"
    try {
      const ptKey = `trend_pt|pg:${page_id}|tok:${tokenSig(token)}`
      pageTokenCacheState = readCache(__trendPageTokenCache, ptKey) ? "hit" : __trendPageTokenInflight.has(ptKey) ? "inflight" : "miss"
      pageToken = await getPageTokenCached({ page_id, token })
    } catch (e: any) {
      if (e?.message === "failed_to_get_page_access_token") {
        return jsonError(
          "failed_to_get_page_access_token",
          { upstreamStatus: e?.upstreamStatus, upstreamBody: e?.upstreamBody },
          e?.upstreamStatus || 400,
        )
      }
      throw e
    }

    const run = (async (): Promise<TrendResponseCached> => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[trend][auth]", {
        hasToken: Boolean(token),
        page_id,
        ig_id,
        usedHardcodePage: !(pageIdFromCookies || pageIdFromHeader),
        usedHardcodeIg: !(igIdFromCookies || igIdFromHeader),
      })
    }

    const untilMs = Date.now()
    const sinceMs = untilMs - (days - 1) * 24 * 60 * 60 * 1000

    const since = toUnixSeconds(sinceMs)
    const until = toUnixSeconds(untilMs)

    // Do not request impressions; many apps/accounts reject it with (#100).
    const primaryMetrics = ["reach", "total_interactions", "accounts_engaged"]

    const buildInsightsUrl = (metricList: string[]) =>
      `${GRAPH_BASE}/${encodeURIComponent(ig_id)}/insights` +
      `?metric=${encodeURIComponent(metricList.join(","))}` +
      `&metric_type=total_value` +
      `&period=day` +
      `&since=${encodeURIComponent(String(since))}` +
      `&until=${encodeURIComponent(String(until))}` +
      `&access_token=${encodeURIComponent(pageToken)}`

    const ins = await fetchInsightsCached({
      ig_id,
      since,
      until,
      metricList: primaryMetrics,
      pageToken,
    })
    const insightsOk = ins.ok
    const insightsData = ins.data
    const insightsBody = ins.body
    const insightsCacheState = ins.cacheState

    const buildInsightsPoints = (data: any[]) => {
      const byDay = new Map<number, TrendPoint>()
      const ensure = (ts: number) => {
        const key = startOfDayMs(ts)
        const existing = byDay.get(key)
        if (existing) return existing
        const init: TrendPoint = { ts: key, reach: null, impressions: null, engaged: null, followerDelta: null }
        byDay.set(key, init)
        return init
      }

      for (const item of data) {
        const name = String(item?.name || "").trim()
        const values = Array.isArray(item?.values) ? item.values : []
        for (const v of values) {
          const endTime = typeof v?.end_time === "string" ? v.end_time : ""
          const ms = endTime ? Date.parse(endTime) : NaN
          if (!Number.isFinite(ms)) continue
          const num = toNullableNumber(v?.value)

          const p = ensure(ms)
          if (name === "reach") p.reach = num
          // Map total_interactions into the "impressions" slot for UI continuity.
          else if (name === "total_interactions") p.impressions = num
          else if (name === "accounts_engaged") p.engaged = num
        }
      }

      return Array.from(byDay.values()).sort((a, b) => a.ts - b.ts)
    }

    let points: TrendPoint[] = []
    let fallbackCacheState: "hit" | "miss" | "inflight" | "skip" = "skip"
    if (insightsOk) {
      points = buildInsightsPoints(insightsData)
    }

    if (!points.length) {
      try {
        const fb = await buildFallbackPointsCached({
          origin: url.origin,
          days,
          ig_id,
          page_id,
          token,
          rawCookieHeader,
        })
        points = fb.points
        fallbackCacheState = fb.cacheState
      } catch {
        points = []
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[trend][api]", {
        days,
        len: points.length,
        first: points.length ? points[0] : null,
        last: points.length ? points[points.length - 1] : null,
      })
    }

      const out: TrendResponse = { ok: true, days, points }
      const cachedOut: TrendResponseCached = { out, insightsCacheState, fallbackCacheState }
      writeCache(__trendCache, cacheKey, cachedOut, 8_000)
      pruneOldest(__trendCache, 200)
      return cachedOut
    })()

    __trendInflight.set(cacheKey, run)
    try {
      const out = await run
      const headers: Record<string, string> = { "Cache-Control": "no-store" }
      if (__DEV__) headers["X-TR-Cache"] = "miss"
      if (__DEV__) headers["X-TR-PT"] = pageTokenCacheState
      if (__DEV__) headers["X-TR-INS"] = out.insightsCacheState
      if (__DEV__) headers["X-TR-FB"] = out.fallbackCacheState
      return NextResponse.json(out.out, { status: 200, headers })
    } finally {
      __trendInflight.delete(cacheKey)
    }
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500)
  }
}
