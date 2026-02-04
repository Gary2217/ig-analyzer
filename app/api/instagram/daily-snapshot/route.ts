import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "daily-snapshot-points-v2"

const HANDLER_FILE = "app/api/instagram/daily-snapshot/route.ts"
const HANDLER_VERSION = "ds-v24-reach-1"
const HANDLER_HEADERS = {
  "X-Handler-File": HANDLER_FILE,
  "X-Handler-Version": HANDLER_VERSION,
  "X-Handler-Build-Marker": BUILD_MARKER,
} as const

const __DEBUG_DAILY_SNAPSHOT__ = process.env.IG_GRAPH_DEBUG === "1"

const __DEV__ = process.env.NODE_ENV !== "production"

type DsResponsePayload = {
  body: any
  status: number
  source: "db" | "graph" | "error"
}

type CacheEntry<T> = { at: number; ttl: number; value: T }

const __dsInflight = new Map<string, Promise<DsResponsePayload>>()
const __dsInflightJoinCount = new Map<string, number>()
const __dsCache = new Map<string, CacheEntry<{ body: any; status: number; source: DsResponsePayload["source"] }>>()

const __dsTotalsCache = new Map<string, CacheEntry<{ ok: boolean; insights_daily: any }>>()
const __dsFollowersCache = new Map<string, CacheEntry<{ followersCount: number | null; capturedAt: string }>>()
const __dsFollowersInflight = new Map<string, Promise<void>>()

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

function tokenSignature(rawToken: string) {
  const t = String(rawToken || "").trim()
  if (!t) return ""
  try {
    return createHash("sha256").update(t).digest("hex").slice(0, 16)
  } catch {
    // ultra-conservative fallback (still avoids storing raw token)
    return `${t.slice(0, 2)}_${t.slice(-2)}`
  }
}

async function getTotalsCached(params: {
  totalsKey: string
  token: string
  envToken: string
  pageId: string
  igId: string
  days: number
}) {
  const cached = readCache(__dsTotalsCache, params.totalsKey)
  if (cached) return cached

  const ttl = 25_000
  const value = await fetchTotalsBestEffort({
    token: params.token,
    envToken: params.envToken,
    pageId: params.pageId,
    igId: params.igId,
    days: params.days,
  })

  writeCache(__dsTotalsCache, params.totalsKey, value, ttl)
  pruneOldest(__dsTotalsCache, 200)
  return value
}

async function writeFollowersBestEffortCached(params: {
  followersKey: string
  token: string
  igId: string
}) {
  // Best-effort: never throw, never fail the request.
  try {
    const existing = readCache(__dsFollowersCache, params.followersKey)
    if (existing) return

    const inflight = __dsFollowersInflight.get(params.followersKey)
    if (inflight) {
      await inflight.catch(() => null)
      return
    }

    const p = (async () => {
      try {
        const meUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}`)
        meUrl.searchParams.set("fields", "followers_count")
        meUrl.searchParams.set("access_token", params.token)

        const r = await fetch(meUrl.toString(), { method: "GET", cache: "no-store" })
        const body = await safeJson(r)
        const followersCountRaw = (body as any)?.followers_count
        const followersCount = toFiniteNumOrNull(followersCountRaw)
        const capturedAt = new Date().toISOString()

        // Cache even null for a short TTL to prevent repeated hot-loop fetches.
        writeCache(__dsFollowersCache, params.followersKey, { followersCount, capturedAt }, 45_000)
        pruneOldest(__dsFollowersCache, 200)

        if (followersCount !== null) {
          const dayStr = todayUtcDateString()
          try {
            await supabaseServer.from("ig_daily_followers").upsert(
              {
                ig_user_id: String(params.igId),
                day: dayStr,
                followers_count: Math.floor(followersCount),
                captured_at: capturedAt,
              } as any,
              { onConflict: "ig_user_id,day" },
            )
          } catch (e: any) {
            if (__DEBUG_DAILY_SNAPSHOT__) {
              console.log("[daily-snapshot] followers_upsert_failed", { message: e?.message ?? String(e) })
            }
          }
        }
      } catch (e: any) {
        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] followers_fetch_failed", { message: e?.message ?? String(e) })
        }
      }
    })()

    __dsFollowersInflight.set(params.followersKey, p)
    await p
  } finally {
    __dsFollowersInflight.delete(params.followersKey)
  }
}

// Force Graph v24.0 (avoid auto-upgrade drift)
const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

function todayUtcDateString() {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function utcDateStringFromOffset(daysAgo: number) {
  const now = new Date()
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) -
    daysAgo * 24 * 60 * 60 * 1000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function toSafeInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

type DailySnapshotPoint = {
  date: string
  reach: number
  impressions: number // v24: keep for backward-compat; we set to 0 (impressions not available in our /insights usage)
  interactions: number
  engaged_accounts: number // v24: accounts_engaged requires metric_type=total_value; no per-day series. Keep 0 in points.
}

function buildPaddedPoints(params: {
  days: number
  byDate: Map<string, { reach: number; impressions: number; interactions: number; engaged_accounts: number }>
}) {
  const out: DailySnapshotPoint[] = []
  for (let i = params.days - 1; i >= 0; i--) {
    const date = utcDateStringFromOffset(i)
    const row = params.byDate.get(date)
    out.push({
      date,
      reach: row ? row.reach : 0,
      impressions: row ? row.impressions : 0,
      interactions: row ? row.interactions : 0,
      engaged_accounts: row ? row.engaged_accounts : 0,
    })
  }
  return out
}

function buildPointsFromGraphInsightsTimeSeries(insightsDailySeries: any[], days: number) {
  const byDate = new Map<
    string,
    { reach: number; impressions: number; interactions: number; engaged_accounts: number }
  >()

  const list = Array.isArray(insightsDailySeries) ? insightsDailySeries : []
  for (const item of list) {
    const name = String(item?.name || "").trim()
    const values = Array.isArray(item?.values) ? item.values : []

    for (const v of values) {
      const endTime = typeof v?.end_time === "string" ? v.end_time : ""
      const ms = endTime ? Date.parse(endTime) : NaN
      if (!Number.isFinite(ms)) continue

      const d = new Date(ms)
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`

      const ex =
        byDate.get(dateStr) ?? {
          reach: 0,
          impressions: 0,
          interactions: 0,
          engaged_accounts: 0,
        }

      const num = toSafeInt(v?.value)

      if (name === "reach") ex.reach = num
      else if (name === "total_interactions") ex.interactions = num
      else if (name === "views" || name === "content_views") ex.impressions = num
      // v24 note: impressions not supported here; keep 0
      // v24 note: accounts_engaged requires metric_type=total_value; no time-series here; keep 0

      byDate.set(dateStr, ex)
    }
  }

  return buildPaddedPoints({ days, byDate })
}

function isUnsupportedMetricBody(body: unknown): boolean {
  const b = body as any
  const code = typeof b?.error?.code === "number" ? b.error.code : typeof b?.code === "number" ? b.code : undefined
  const msg =
    typeof b?.error?.message === "string"
      ? String(b.error.message).toLowerCase()
      : typeof b?.message === "string"
        ? String(b.message).toLowerCase()
        : ""
  return code === 100 || msg.includes("invalid") || msg.includes("unsupported") || msg.includes("metric")
}

function buildInsightsDailyTotals(params: {
  total_interactions: number | null
  accounts_engaged: number | null
  profile_views: number | null
  follower_change: number | null
  impressions_total: number | null
}) {
  const wrap = (name: string, value: number | null) => ({ name, total_value: { value } })
  return [
    wrap("total_interactions", params.total_interactions),
    wrap("accounts_engaged", params.accounts_engaged),
    wrap("profile_views", params.profile_views),
    wrap("follower_change", params.follower_change),
    wrap("impressions_total", params.impressions_total),
  ]
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function toFiniteNumOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function jsonError(message: string, extra?: any, status = 400) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? null) },
    { status, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
  )
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

function clampDays(raw: string | null) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 7
  const i = Math.floor(n)
  if (i < 1) return 1
  if (i > 365) return 365
  return i
}

function toUnixSeconds(ms: number) {
  return Math.floor(ms / 1000)
}

async function getIdsIfMissing(token: string, pageId: string, igId: string) {
  if (pageId && igId) return { ok: true as const, pageId, igId }

  const accountsUrl = new URL(`${GRAPH_BASE}/me/accounts`)
  accountsUrl.searchParams.set("fields", "name,instagram_business_account")
  accountsUrl.searchParams.set("access_token", token)

  const r = await fetch(accountsUrl.toString(), { method: "GET", cache: "no-store" })
  const body = await safeJson(r)
  if (!r.ok) return { ok: false as const, status: r.status || 400, body }

  const list: any[] = Array.isArray(body?.data) ? body.data : []
  const picked = list.find((p) => p?.instagram_business_account?.id)
  const nextPageId = typeof picked?.id === "string" ? picked.id : ""
  const nextIgId =
    typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id : ""

  if (!nextPageId || !nextIgId) {
    return { ok: false as const, status: 403, body: { error: "no_instagram_business_account" } }
  }

  return { ok: true as const, pageId: nextPageId, igId: nextIgId }
}

async function getPageAccessToken(userToken: string, pageId: string) {
  const pageTokenUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}`)
  pageTokenUrl.searchParams.set("fields", "access_token")
  pageTokenUrl.searchParams.set("access_token", userToken)

  const r = await fetch(pageTokenUrl.toString(), { method: "GET", cache: "no-store" })
  const body = await safeJson(r)
  if (!r.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) {
    return { ok: false as const, status: r.status || 400, body }
  }
  return { ok: true as const, pageAccessToken: body.access_token.trim() as string }
}

async function fetchInsightsTimeSeries(params: { igId: string; pageAccessToken: string; days: number }) {
  const DAY_MS = 24 * 60 * 60 * 1000
  const MAX_DAYS_PER_CALL = 30

  // v24 verified: reach time-series works; best-effort impressions-like curve via views
  const metricListPrimary = ["reach", "views"]
  const metricListFallback = ["reach"]

  let remainingDays = Math.max(1, params.days)
  let currentUntilMs = Date.now()

  const mergedData: any[] = []
  let lastStatus = 200
  let lastBody: any = null
  let lastUrl = ""

  while (remainingDays > 0) {
    const chunkDays = Math.min(MAX_DAYS_PER_CALL, remainingDays)

    const sinceMs = currentUntilMs - (chunkDays - 1) * DAY_MS
    const since = toUnixSeconds(sinceMs)
    const until = toUnixSeconds(currentUntilMs)

    const run = async (metricList: string[]) => {
      const u = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
      u.searchParams.set("metric", metricList.join(","))
      u.searchParams.set("period", "day")
      u.searchParams.set("since", String(since))
      u.searchParams.set("until", String(until))
      u.searchParams.set("access_token", params.pageAccessToken)
      lastUrl = u.toString()
      const r = await fetch(lastUrl, { method: "GET", cache: "no-store" })
      const body = await safeJson(r)
      return { r, body }
    }

    let r: Response
    let body: any
    ;({ r, body } = await run(metricListPrimary))
    if (!r.ok && isUnsupportedMetricBody(body)) {
      ;({ r, body } = await run(metricListFallback))
    }

    lastStatus = r.status
    lastBody = body

    if (!r.ok) {
      return { ok: false, status: lastStatus, body: lastBody, data: [], url: lastUrl }
    }

    const data = Array.isArray(body?.data) ? body.data : []
    mergedData.push(...data)

    remainingDays -= chunkDays
    currentUntilMs = sinceMs - DAY_MS
  }

  return {
    ok: true,
    status: 200,
    body: { data: mergedData },
    data: mergedData,
    url: lastUrl,
  }
}


async function fetchInsightsTotalValue(params: { igId: string; pageAccessToken: string; days: number }) {
  const untilMs = Date.now()
  const sinceMs = untilMs - (params.days - 1) * 24 * 60 * 60 * 1000
  const since = toUnixSeconds(sinceMs)
  const until = toUnixSeconds(untilMs)

  // v24 best-effort totals (some metrics may be unsupported)
  const metricListPrimary = ["total_interactions", "accounts_engaged", "profile_views"]
  const metricListFallback = ["accounts_engaged", "profile_views"]

  const run = async (metricList: string[]) => {
    const u = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
    u.searchParams.set("metric", metricList.join(","))
    u.searchParams.set("period", "day")
    u.searchParams.set("metric_type", "total_value")
    u.searchParams.set("since", String(since))
    u.searchParams.set("until", String(until))
    u.searchParams.set("access_token", params.pageAccessToken)
    const r = await fetch(u.toString(), { method: "GET", cache: "no-store" })
    const body = await safeJson(r)
    return { r, body, url: u.toString() }
  }

  let r: Response
  let body: any
  let url = ""
  ;({ r, body, url } = await run(metricListPrimary))
  if (!r.ok && isUnsupportedMetricBody(body)) {
    ;({ r, body, url } = await run(metricListFallback))
  }

  const data = Array.isArray(body?.data) ? body.data : []

  // Normalize to totals (null when missing)
  let total_interactions: number | null = null
  let profile_views: number | null = null
  let accounts_engaged: number | null = null
  for (const item of data) {
    const name = String(item?.name || "").trim()
    const valRaw = item?.total_value?.value
    const val = typeof valRaw === "number" ? valRaw : Number(valRaw)
    if (!Number.isFinite(val)) continue
    if (name === "profile_views") profile_views = Math.max(0, Math.floor(val))
    else if (name === "accounts_engaged") accounts_engaged = Math.max(0, Math.floor(val))
    else if (name === "total_interactions") total_interactions = Math.max(0, Math.floor(val))
  }

  return {
    ok: r.ok,
    status: r.status,
    body,
    data,
    totals: { total_interactions, profile_views, accounts_engaged },
    url,
  }
}

async function fetchTotalsBestEffort(params: {
  token: string
  envToken: string
  pageId: string
  igId: string
  days: number
}) {
  let pageToken = await getPageAccessToken(params.token, params.pageId)
  if (!pageToken.ok && params.envToken) pageToken = await getPageAccessToken(params.envToken, params.pageId)
  if (!pageToken.ok) {
    return { ok: false as const, insights_daily: buildInsightsDailyTotals({ total_interactions: null, accounts_engaged: null, profile_views: null, follower_change: null, impressions_total: null }) }
  }

  const totalsResp = await fetchInsightsTotalValue({
    igId: params.igId,
    pageAccessToken: pageToken.pageAccessToken,
    days: params.days,
  })

  const insights_daily = buildInsightsDailyTotals({
    total_interactions: totalsResp.ok ? totalsResp.totals.total_interactions : null,
    accounts_engaged: totalsResp.ok ? totalsResp.totals.accounts_engaged : null,
    profile_views: totalsResp.ok ? totalsResp.totals.profile_views : null,
    follower_change: null,
    impressions_total: null,
  })

  return { ok: totalsResp.ok as boolean, insights_daily }
}

async function getAvailableDaysCount(params: { igId: string; pageId: string }) {
  try {
    const r = await (supabaseServer as any)
      .from("ig_daily_insights")
      .select("day", { count: "exact", head: true })
      .eq("ig_user_id", Number(params.igId))
      .eq("page_id", Number(params.pageId))
    const count = typeof (r as any)?.count === "number" ? (r as any).count : null
    return Number.isFinite(count) ? (count as number) : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))
    const safeDays = Math.max(1, days)

    const h = req.headers.get("x-cron-secret")
    const cron = process.env.CRON_SECRET
    const cronMode = Boolean(h && cron && h === cron)

    let token = ""
    let pageId = ""
    let igId = ""

    let c: any = null
    if (cronMode) {
      const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
      const envUserId = (process.env.IG_USER_ID ?? "").trim()
      if (!envToken) return jsonError("missing_env:IG_ACCESS_TOKEN", null, 401)
      if (!envUserId) return jsonError("missing_env:IG_USER_ID", null, 401)
      token = envToken
      igId = envUserId
    } else {
      try {
        c = await (cookies() as any)
      } catch {
        c = null
      }

      const rawCookieHeader = req.headers.get("cookie") || ""

      const tokenFromCookies = typeof c?.get === "function" ? (c.get("ig_access_token")?.value ?? "") : ""
      const pageIdFromCookies = typeof c?.get === "function" ? (c.get("ig_page_id")?.value ?? "") : ""
      const igIdFromCookies = typeof c?.get === "function" ? (c.get("ig_ig_id")?.value ?? "") : ""

      const tokenFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_access_token")
      const pageIdFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_page_id")
      const igIdFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_ig_id")

      token = (tokenFromCookies || tokenFromHeader).trim()
      pageId = (pageIdFromCookies || pageIdFromHeader).trim()
      igId = (igIdFromCookies || igIdFromHeader).trim()

      if (!token) return jsonError("missing_cookie:ig_access_token", null, 401)
    }

    // If ids are missing, try to load them (and set cookies if possible).
    if (!pageId || !igId) {
      try {
        const ids = await getIdsIfMissing(token, pageId, igId)
        if (ids.ok) {
          pageId = ids.pageId
          igId = ids.igId
          try {
            if (!cronMode && typeof c?.set === "function") {
              c.set("ig_page_id", pageId, { httpOnly: true, sameSite: "lax", path: "/" })
              c.set("ig_ig_id", igId, { httpOnly: true, sameSite: "lax", path: "/" })
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    if (!pageId) return jsonError(cronMode ? "missing_ids:page_id" : "missing_cookie:ig_page_id", null, 401)
    if (!igId) return jsonError(cronMode ? "missing_ids:ig_ig_id" : "missing_cookie:ig_ig_id", null, 401)

    const tokSig = cronMode ? "cron" : tokenSignature(token)
    const requestKey = `ds|${cronMode ? "cron" : "user"}|ig:${igId}|pg:${pageId}|days:${safeDays}|tok:${tokSig}`
    const totalsKey = `ds_totals|${cronMode ? "cron" : "user"}|ig:${igId}|pg:${pageId}|days:${safeDays}|tok:${tokSig}`
    const followersKey = `ds_followers|${cronMode ? "cron" : "user"}|ig:${igId}|tok:${tokSig}`

    const cachedResp = readCache(__dsCache, requestKey)
    if (cachedResp) {
      if (__DEV__) {
        console.debug("[daily-snapshot] cache_hit", { key: requestKey, source: cachedResp.source })
      }
      const headers: Record<string, string> = { "Cache-Control": "no-store", ...HANDLER_HEADERS }
      if (__DEV__) headers["X-DS-Cache"] = "hit"
      if (__DEV__) headers["X-DS-Source"] = String(cachedResp.source)
      return NextResponse.json(cachedResp.body, { status: cachedResp.status, headers })
    }

    const inflight = __dsInflight.get(requestKey)
    if (inflight) {
      const joined = (__dsInflightJoinCount.get(requestKey) ?? 0) + 1
      __dsInflightJoinCount.set(requestKey, joined)
      if (__DEV__) {
        console.debug("[daily-snapshot] inflight_join", { key: requestKey, joinCount: joined })
      }
      const out = await inflight
      const headers: Record<string, string> = { "Cache-Control": "no-store", ...HANDLER_HEADERS }
      if (__DEV__) headers["X-DS-Cache"] = "inflight"
      if (__DEV__) headers["X-DS-Inflight-Joins"] = String(joined)
      if (__DEV__) headers["X-DS-Source"] = String(out.source)
      return NextResponse.json(out.body, { status: out.status, headers })
    }

    const run = (async (): Promise<DsResponsePayload> => {
      // Best-effort: write today's followers_count snapshot (do not affect API success)
      void writeFollowersBestEffortCached({ followersKey, token, igId })

      const availableDays = (await getAvailableDaysCount({ igId, pageId })) ?? null

    // Prefer DB snapshots for the trend chart.
    const today = todayUtcDateString()
    const start = utcDateStringFromOffset(safeDays - 1)

    if (__DEBUG_DAILY_SNAPSHOT__) {
      console.log("[daily-snapshot] scope", { days: safeDays })
    }

    // 1) Try DB first
    try {
      const { data: dbRows, error: dbError } = await supabaseServer
        .from("ig_daily_insights")
        .select("day,reach,impressions,total_interactions,accounts_engaged")
        .eq("ig_user_id", Number(igId))
        .eq("page_id", Number(pageId))
        .gte("day", start)
        .lte("day", today)
        .order("day", { ascending: true })

      const list = Array.isArray(dbRows) ? dbRows : []
      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] db", {
          err: dbError
            ? { message: (dbError as any)?.message, code: (dbError as any)?.code, hint: (dbError as any)?.hint }
            : null,
          rows_len: list.length,
        })
      }

      if (!dbError && list.length > 0) {
        const byDate = new Map<
          string,
          { reach: number; impressions: number; interactions: number; engaged_accounts: number }
        >()
        for (const r of list as any[]) {
          const dateStr = String(r?.day || "").trim()
          if (!dateStr) continue
          byDate.set(dateStr, {
            reach: toSafeInt(r?.reach),
            impressions: toSafeInt(r?.impressions), // may be 0 in v24 path
            interactions: toSafeInt(r?.total_interactions),
            engaged_accounts: toSafeInt(r?.accounts_engaged), // may be 0 in v24 path
          })
        }

        const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
        const totals = await getTotalsCached({ totalsKey, token, envToken, pageId, igId, days: safeDays })

        return {
          status: 200,
          source: "db",
          body: {
            build_marker: BUILD_MARKER,
            ok: true,
            days: safeDays,
            available_days: availableDays ?? list.length,
            points: buildPaddedPoints({ days: safeDays, byDate }),
            points_ok: true,
            points_source: "db",
            points_end_date: today,
            // we’ll still provide totals even when DB hit is used (best effort)
            insights_daily: totals.insights_daily,
            insights_daily_series: [],
            series_ok: true,
            __diag: { db_rows: list.length, used_source: "db", start, end: today },
          },
        }
      }
    } catch {
      // ignore DB failures here; fall back to Graph
    }

    if (__DEBUG_DAILY_SNAPSHOT__) console.log("[daily-snapshot] db empty")

    // 2) Seed from Graph (v24 rules)
    try {
      const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()

      // page access token via cookie token
      let pageToken = await getPageAccessToken(token, pageId)
      let tokenSource: "cookie" | "env" = "cookie"

      // optional env fallback
      if (!pageToken.ok && envToken) {
        tokenSource = "env"
        pageToken = await getPageAccessToken(envToken, pageId)
      }

      if (!pageToken.ok) {
        // hard fail with diag (don’t silently treat as empty)
        return {
          status: 401,
          source: "error",
          body: {
            build_marker: BUILD_MARKER,
            ok: false,
            error: "page_access_token_failed",
            __diag: { token_source: tokenSource, pageTokenStatus: pageToken.status, pageTokenBody: pageToken.body },
          },
        }
      }

      const series = await fetchInsightsTimeSeries({
        igId,
        pageAccessToken: pageToken.pageAccessToken,
        days: safeDays,
      })

      if (!series.ok) {
        return {
          status: 502,
          source: "error",
          body: {
            build_marker: BUILD_MARKER,
            ok: false,
            error: "graph_time_series_failed",
            __diag: {
              token_source: tokenSource,
              status: series.status,
              body: series.body,
              start,
              end: today,
            },
          },
        }
      }

      const points = buildPointsFromGraphInsightsTimeSeries(series.data, safeDays)

      const hasAnyNonZero =
        Array.isArray(points) &&
        points.some((p) => toSafeInt(p?.reach) > 0 || toSafeInt(p?.interactions) > 0)

      // totals (best-effort)
      const totals = await getTotalsCached({ totalsKey, token, envToken, pageId, igId, days: safeDays })
      const insights_daily = totals.insights_daily

      if (!hasAnyNonZero) {
        return {
          status: 200,
          source: "graph",
          body: {
            build_marker: BUILD_MARKER,
            ok: true,
            days: safeDays,
            available_days: availableDays,
            points: [],
            points_ok: false,
            points_source: "empty",
            points_end_date: today,
            insights_daily,
            insights_daily_series: series.data,
            series_ok: true,
            __diag: {
              db_rows: 0,
              used_source: "graph",
              start,
              end: today,
              token_source: tokenSource,
              totals_ok: totals.ok,
            },
          },
        }
      }

      // Write to DB (skip today)
      try {
        const candidate = points
          .filter((p) => p?.date && p.date !== today)
          .map((p) => ({
            day: p.date,
            reach: toSafeInt(p.reach),
            impressions: 0,
            total_interactions: toSafeInt(p.interactions),
            accounts_engaged: 0,
          }))

        const skipDays = new Set<string>()
        try {
          const daysToCheck = candidate.map((r) => r.day).filter(Boolean)
          const { data: existing } = daysToCheck.length
            ? await supabaseServer
                .from("ig_daily_insights")
                .select("day,reach,impressions,total_interactions,accounts_engaged")
                .eq("ig_user_id", Number(igId))
                .eq("page_id", Number(pageId))
                .in("day", daysToCheck)
            : ({ data: [] } as any)

          for (const r of (Array.isArray(existing) ? existing : []) as any[]) {
            const d = String(r?.day || "").trim()
            if (!d) continue
            if (
              toSafeInt(r?.reach) > 0 ||
              toSafeInt(r?.impressions) > 0 ||
              toSafeInt(r?.total_interactions) > 0 ||
              toSafeInt(r?.accounts_engaged) > 0
            ) {
              skipDays.add(d)
            }
          }
        } catch {
          // ignore
        }

        const rowsToUpsert = candidate
          .filter((r) => !skipDays.has(r.day))
          .map((r) => ({
            ig_user_id: Number(igId),
            page_id: Number(pageId),
            day: r.day,
            reach: r.reach,
            impressions: r.impressions,
            total_interactions: r.total_interactions,
            accounts_engaged: r.accounts_engaged,
            updated_at: new Date().toISOString(),
          }))

        if (rowsToUpsert.length >= 1) {
          await supabaseServer.from("ig_daily_insights").upsert(rowsToUpsert as any, {
            onConflict: "ig_user_id,page_id,day",
          })
        }
      } catch {
        // ignore db write failures
      }

      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] graph_seed_ok", {
          token_source: tokenSource,
          series_status: series.status,
          totals_ok: totals.ok,
        })
      }

      return {
        status: 200,
        source: "graph",
        body: {
          build_marker: BUILD_MARKER,
          ok: true,
          days: safeDays,
          available_days: availableDays,
          points,
          points_ok: true,
          points_source: "graph_series_v24",
          points_end_date: today,
          insights_daily,
          insights_daily_series: series.data,
          series_ok: true,
          __diag: {
            db_rows: 0,
            used_source: "graph",
            start,
            end: today,
            token_source: tokenSource,
            totals_ok: totals.ok,
          },
        },
      }
    } catch (e: any) {
      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] graph_seed_failed", {
          message: e?.message ?? "graph_seed_failed",
        })
      }
      return {
        status: 502,
        source: "error",
        body: {
          build_marker: BUILD_MARKER,
          ok: false,
          error: "graph_seed_failed",
          message: e?.message ?? String(e),
        },
      }
    }
    })()

    __dsInflight.set(requestKey, run)
    __dsInflightJoinCount.set(requestKey, 0)

    let out: DsResponsePayload
    try {
      out = await run
    } finally {
      __dsInflight.delete(requestKey)
    }

    const respTtl = 8_000
    writeCache(__dsCache, requestKey, { body: out.body, status: out.status, source: out.source }, respTtl)
    pruneOldest(__dsCache, 200)

    if (__DEV__) {
      const joinCount = __dsInflightJoinCount.get(requestKey) ?? 0
      console.debug("[daily-snapshot] cache_store", { key: requestKey, ttlMs: respTtl, source: out.source, joinCount })
    }

    const headers: Record<string, string> = { "Cache-Control": "no-store", ...HANDLER_HEADERS }
    if (__DEV__) headers["X-DS-Cache"] = "miss"
    if (__DEV__) headers["X-DS-Source"] = String(out.source)
    if (__DEV__) headers["X-DS-Inflight-Joins"] = String(__dsInflightJoinCount.get(requestKey) ?? 0)
    __dsInflightJoinCount.delete(requestKey)
    return NextResponse.json(out.body, { status: out.status, headers })
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500)
  }
}
