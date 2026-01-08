import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function jsonError(message: string, extra?: any, status = 400) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? null) }, { status, headers: { "Cache-Control": "no-store" } })
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
}) {
  const untilMs = Date.now()
  const sinceMs = untilMs - (params.days - 1) * 24 * 60 * 60 * 1000
  const since = toUnixSeconds(sinceMs)
  const until = toUnixSeconds(untilMs)

  const metricList = ["reach", "total_interactions", "accounts_engaged"]

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

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))

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

    const pageTokenRes = await getPageAccessToken(token, pageId)
    if (!pageTokenRes.ok) {
      // Backward-compatible: still return ok:true but no data.
      return NextResponse.json(
        {
          ok: true,
          days,
          insights_daily: [],
          insights_daily_series: [],
          series_ok: false,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      )
    }

    const totalsRes = await fetchInsights({ igId, pageAccessToken: pageTokenRes.pageAccessToken, days, metricType: "total_value" })
    const seriesRes = await fetchInsights({ igId, pageAccessToken: pageTokenRes.pageAccessToken, days, metricType: "time_series" })

    const insights_daily = Array.isArray(totalsRes.data) ? totalsRes.data : []
    const insights_daily_series = Array.isArray(seriesRes.data) ? seriesRes.data : []

    const series_ok = Boolean(seriesRes.ok && insights_daily_series.length > 0)

    if (shouldDebug()) {
      console.log("[IG_GRAPH_DEBUG][daily-snapshot]", {
        days,
        hasToken: Boolean(token),
        hasIds: Boolean(pageId && igId),
        totals_ok: Boolean(totalsRes.ok),
        totals_len: insights_daily.length,
        series_ok,
        series_len: insights_daily_series.length,
      })
    }

    return NextResponse.json(
      {
        ok: true,
        days,
        insights_daily,
        insights_daily_series,
        series_ok,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (err: any) {
    return jsonError("server_error", { message: err?.message ?? String(err) }, 500)
  }
}
