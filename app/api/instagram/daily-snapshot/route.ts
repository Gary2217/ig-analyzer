import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "daily-snapshot-points-v2"

const HANDLER_FILE = "app/api/instagram/daily-snapshot/route.ts"
const HANDLER_VERSION = "ds-v2-diag-1"
const HANDLER_HEADERS = {
  "X-Handler-File": HANDLER_FILE,
  "X-Handler-Version": HANDLER_VERSION,
  "X-Handler-Build-Marker": BUILD_MARKER,
} as const

const __DEV__ = process.env.NODE_ENV !== "production"
const __DEBUG_DAILY_SNAPSHOT__ = process.env.IG_GRAPH_DEBUG === "1"

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
  impressions: number
  interactions: number
  engaged_accounts: number
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

function buildPointsFromGraphInsights(insightsDailySeries: any[], days: number) {
  const byDate = new Map<string, { reach: number; impressions: number; interactions: number; engaged_accounts: number }>()

  const list = Array.isArray(insightsDailySeries) ? insightsDailySeries : []
  for (const item of list) {
    const name = String(item?.name || "").trim()
    const values = Array.isArray(item?.values) ? item.values : []
    for (const v of values) {
      const endTime = typeof v?.end_time === "string" ? v.end_time : ""
      const ms = endTime ? Date.parse(endTime) : NaN
      if (!Number.isFinite(ms)) continue

      const d = new Date(ms)
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
      const ex = byDate.get(dateStr) ?? { reach: 0, impressions: 0, interactions: 0, engaged_accounts: 0 }
      const num = toSafeInt(v?.value)
      if (name === "reach") ex.reach = num
      else if (name === "impressions" || name === "views") ex.impressions = num
      else if (name === "total_interactions") ex.interactions = num
      else if (name === "accounts_engaged") ex.engaged_accounts = num
      byDate.set(dateStr, ex)
    }
  }

  return buildPaddedPoints({ days, byDate })
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
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

function shouldDebug() {
  return process.env.IG_GRAPH_DEBUG === "1"
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
  const nextIgId = typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id : ""

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

async function fetchInsights(params: {
  igId: string
  pageAccessToken: string
  days: number
  metricType: "total_value" | "time_series"
  metricsOverride?: string[]
}) {
  const untilMs = Date.now()
  const sinceMs = untilMs - (params.days - 1) * 24 * 60 * 60 * 1000
  const since = toUnixSeconds(sinceMs)
  const until = toUnixSeconds(untilMs)

  const metricList = Array.isArray(params.metricsOverride) && params.metricsOverride.length
    ? params.metricsOverride
    : ["reach", "total_interactions", "accounts_engaged"]

  const u = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
  u.searchParams.set("metric", metricList.join(","))
  u.searchParams.set("period", "day")
  u.searchParams.set("metric_type", params.metricType)
  u.searchParams.set("since", String(since))
  u.searchParams.set("until", String(until))
  u.searchParams.set("access_token", params.pageAccessToken)

  const r = await fetch(u.toString(), { method: "GET", cache: "no-store" })
  const body = await safeJson(r)
  const data = Array.isArray(body?.data) ? body.data : []
  return { ok: r.ok, status: r.status, body, data }
}

function isUnsupportedMetricBody(body: unknown): boolean {
  const b = body as any
  const code = typeof b?.error?.code === "number" ? b.error.code : typeof b?.code === "number" ? b.code : undefined
  const msg = typeof b?.error?.message === "string" ? String(b.error.message).toLowerCase() : typeof b?.message === "string" ? String(b.message).toLowerCase() : ""
  return code === 100 || msg.includes("invalid") || msg.includes("unsupported") || msg.includes("metric")
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))
    const safeDays = Math.max(1, days)

    let c: any = null
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

    const token = (tokenFromCookies || tokenFromHeader).trim()
    let pageId = (pageIdFromCookies || pageIdFromHeader).trim()
    let igId = (igIdFromCookies || igIdFromHeader).trim()

    if (!token) {
      return jsonError("missing_cookie:ig_access_token", null, 401)
    }

    // If ids are missing, try to load them (and set cookies if possible).
    if (!pageId || !igId) {
      try {
        const ids = await getIdsIfMissing(token, pageId, igId)
        if (ids.ok) {
          pageId = ids.pageId
          igId = ids.igId
          try {
            if (typeof c?.set === "function") {
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

    if (!pageId) return jsonError("missing_cookie:ig_page_id", null, 401)
    if (!igId) return jsonError("missing_cookie:ig_ig_id", null, 401)

    // Prefer DB snapshots for the trend chart. Always return exactly N padded points ending today (UTC).
    // If DB has no rows, fall back to the Graph API fetch below.
    const today = todayUtcDateString()
    const start = utcDateStringFromOffset(safeDays - 1)

    if (__DEBUG_DAILY_SNAPSHOT__) {
      console.log("[daily-snapshot] scope", { days: safeDays })
    }

    try {
      const { data: rows, error } = await supabaseServer
        .from("ig_daily_insights")
        .select("day,reach,impressions,total_interactions,accounts_engaged")
        .eq("ig_user_id", Number(igId))
        .eq("page_id", Number(pageId))
        .gte("day", start)
        .lte("day", today)
        .order("day", { ascending: true })

      if (__DEBUG_DAILY_SNAPSHOT__) {
        const list = Array.isArray(rows) ? rows : []
        console.log("[daily-snapshot] db", {
          err: error ? { message: (error as any)?.message, code: (error as any)?.code, hint: (error as any)?.hint } : null,
          rows_len: list.length,
        })
      }

      if (!error && Array.isArray(rows) && rows.length >= 1) {
        const byDate = new Map<string, { reach: number; impressions: number; interactions: number; engaged_accounts: number }>()
        for (const r of rows as any[]) {
          const dateStr = String(r?.day || "").trim()
          if (!dateStr) continue
          byDate.set(dateStr, {
            reach: toSafeInt(r?.reach),
            impressions: toSafeInt(r?.impressions),
            interactions: toSafeInt(r?.total_interactions),
            engaged_accounts: toSafeInt(r?.accounts_engaged),
          })
        }

        const points = buildPaddedPoints({ days: safeDays, byDate })

        return NextResponse.json(
          {
            build_marker: BUILD_MARKER,
            ok: true,
            days: safeDays,
            points,
            points_ok: true,
            points_source: "db_snapshots",
            points_end_date: today,
            insights_daily: [],
            insights_daily_series: [],
            series_ok: true,
            __diag: { db_rows: rows.length, used_source: "db", start, end: today },
          },
          { status: 200, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
        )
      }
    } catch {
      // ignore DB failures here; fall back to Graph
    }

    if (__DEBUG_DAILY_SNAPSHOT__) console.log("[daily-snapshot] db empty")

    // Seed when DB is empty (safe for prod):
    // - Prefer cookie token (existing auth)
    // - Fallback to env IG_ACCESS_TOKEN only if cookie token fails
    // - Any Graph failure => fallback_zero_series (200)
    try {
      const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()

      // 1) page access token via cookie token
      let pageToken = await getPageAccessToken(token, pageId)
      let tokenSource: "cookie" | "env" = "cookie"

      // 2) optional env fallback
      if (!pageToken.ok && envToken) {
        tokenSource = "env"
        pageToken = await getPageAccessToken(envToken, pageId)
      }

      if (!pageToken.ok) throw new Error("page_access_token_failed")

      const metricsPrimary = ["reach", "impressions", "total_interactions", "accounts_engaged"]
      const metricsViewsFallback = ["reach", "views", "total_interactions", "accounts_engaged"]
      const metricsNoImpressions = ["reach", "total_interactions", "accounts_engaged"]

      let impressionsSource: "impressions" | "views" | "none" = "impressions"

      // Try impressions first.
      let series = await fetchInsights({
        igId,
        pageAccessToken: pageToken.pageAccessToken,
        days: safeDays,
        metricType: "time_series",
        metricsOverride: metricsPrimary,
      })

      // If impressions unsupported, try views.
      if (!series.ok && isUnsupportedMetricBody(series.body)) {
        impressionsSource = "views"
        series = await fetchInsights({
          igId,
          pageAccessToken: pageToken.pageAccessToken,
          days: safeDays,
          metricType: "time_series",
          metricsOverride: metricsViewsFallback,
        })
      }

      // If views also unsupported, omit impressions entirely.
      if (!series.ok && isUnsupportedMetricBody(series.body)) {
        impressionsSource = "none"
        series = await fetchInsights({
          igId,
          pageAccessToken: pageToken.pageAccessToken,
          days: safeDays,
          metricType: "time_series",
          metricsOverride: metricsNoImpressions,
        })
      }

      const points = buildPointsFromGraphInsights(series.data, safeDays)
      if (Array.isArray(points) && points.length >= 1) {
        // Never upsert today (partial-day instability).
        try {
          const rowsToUpsert = points
            .filter((p) => p?.date && p.date !== today)
            .map((p) => ({
              ig_user_id: Number(igId),
              page_id: Number(pageId),
              day: p.date,
              reach: toSafeInt(p.reach),
              impressions: toSafeInt(p.impressions),
              total_interactions: toSafeInt(p.interactions),
              accounts_engaged: toSafeInt(p.engaged_accounts),
              updated_at: new Date().toISOString(),
            }))

          if (rowsToUpsert.length >= 1) {
            await supabaseServer.from("ig_daily_insights").upsert(rowsToUpsert as any, { onConflict: "ig_user_id,page_id,day" })
          }
        } catch {
          // ignore db write failures
        }

        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] graph_seed", { status: series.status, token_source: tokenSource, impressions_source: impressionsSource })
        }

        return NextResponse.json(
          {
            build_marker: BUILD_MARKER,
            ok: true,
            days: safeDays,
            points,
            points_ok: true,
            points_source: "graph_series",
            points_end_date: today,
            insights_daily: [],
            insights_daily_series: series.data,
            series_ok: series.ok,
            __diag: { db_rows: 0, used_source: "graph", start, end: today, impressions_source: impressionsSource },
          },
          { status: 200, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
        )
      }
    } catch (e: any) {
      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] graph_seed_failed", { status: typeof e?.status === "number" ? e.status : undefined, message: "graph_seed_failed" })
      }
    }

    return NextResponse.json(
      {
        build_marker: BUILD_MARKER,
        ok: true,
        days: safeDays,
        points: buildPaddedPoints({ days: safeDays, byDate: new Map() }),
        points_ok: false,
        points_source: "fallback_zero_series",
        points_end_date: todayUtcDateString(),
        insights_daily: [],
        insights_daily_series: [],
        series_ok: false,
        __diag: { db_rows: 0, used_source: "fallback", start, end: today },
      },
      { status: 200, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
    )
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500)
  }
}
