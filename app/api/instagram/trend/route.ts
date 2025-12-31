import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// Copied from app/api/instagram/media/route.ts (do not redesign OAuth here)
const PAGE_ID = "851912424681350"
const IG_BUSINESS_ID = "17841404364250644"

type TrendPoint = {
  ts: number
  reach: number | null
  impressions: number | null
  engaged: number | null
  followerDelta: null
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
    if (process.env.NODE_ENV !== "production") {
      console.log("[trend][auth]", {
        hasToken: Boolean(token),
        page_id,
        ig_id,
        usedHardcodePage: !(pageIdFromCookies || pageIdFromHeader),
        usedHardcodeIg: !(igIdFromCookies || igIdFromHeader),
      })
    }

    const pageTokenUrl = `${GRAPH_BASE}/${encodeURIComponent(page_id)}?fields=access_token&access_token=${encodeURIComponent(token)}`
    const pageTokenRes = await fetch(pageTokenUrl, { cache: "no-store" })
    const pageTokenBody = await safeJson(pageTokenRes)

    if (!pageTokenRes.ok || !pageTokenBody?.access_token) {
      return jsonError(
        "failed_to_get_page_access_token",
        { upstreamStatus: pageTokenRes.status, upstreamBody: pageTokenBody },
        pageTokenRes.status || 400,
      )
    }

    const pageToken = pageTokenBody.access_token as string

    const untilMs = Date.now()
    const sinceMs = untilMs - (days - 1) * 24 * 60 * 60 * 1000

    const since = toUnixSeconds(sinceMs)
    const until = toUnixSeconds(untilMs)

    // Primary metrics (some IG accounts/apps don't support "impressions" on this endpoint)
    const primaryMetrics = ["reach", "impressions", "accounts_engaged"]
    const fallbackMetrics = ["reach", "total_interactions", "accounts_engaged"]

    const buildInsightsUrl = (metricList: string[]) =>
      `${GRAPH_BASE}/${encodeURIComponent(ig_id)}/insights` +
      `?metric=${encodeURIComponent(metricList.join(","))}` +
      `&metric_type=total_value` +
      `&period=day` +
      `&since=${encodeURIComponent(String(since))}` +
      `&until=${encodeURIComponent(String(until))}` +
      `&access_token=${encodeURIComponent(pageToken)}`

    let insightsRes = await fetch(buildInsightsUrl(primaryMetrics), { cache: "no-store" })
    let insightsBody = await safeJson(insightsRes)

    // If primary fails due to invalid metric list, retry with fallback metrics
    if (!insightsRes.ok && isInvalidMetricError(insightsBody)) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[trend][insights] primary metrics rejected; retrying fallback", {
          primary: primaryMetrics,
          fallback: fallbackMetrics,
          upstreamStatus: insightsRes.status,
          upstreamBody: insightsBody,
        })
      }
      insightsRes = await fetch(buildInsightsUrl(fallbackMetrics), { cache: "no-store" })
      insightsBody = await safeJson(insightsRes)
    }

    if (!insightsRes.ok) {
      return jsonError(
        "failed_to_fetch_insights",
        {
          upstreamStatus: insightsRes.status,
          upstreamBody: insightsBody,
          tried: { primary: primaryMetrics, fallback: fallbackMetrics },
        },
        insightsRes.status || 400,
      )
    }

    const data = Array.isArray(insightsBody?.data) ? insightsBody.data : []

    // Build a date-keyed map. Graph returns values with end_time.
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
        // If impressions is available, use it.
        else if (name === "impressions") p.impressions = num
        // Fallback mapping: treat total_interactions as "impressions" slot for UI continuity.
        else if (name === "total_interactions") p.impressions = num
        else if (name === "accounts_engaged") p.engaged = num
      }
    }

    const points = Array.from(byDay.values()).sort((a, b) => a.ts - b.ts)

    if (process.env.NODE_ENV !== "production") {
      console.log("[trend][api]", {
        days,
        len: points.length,
        first: points.length ? points[0] : null,
        last: points.length ? points[points.length - 1] : null,
      })
    }

    return NextResponse.json({ ok: true, days, points }, { status: 200 })
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500)
  }
}
