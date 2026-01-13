import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "cron-daily-insights-v1"

const baseHeaders = { "Cache-Control": "no-store", "x-build-marker": BUILD_MARKER } as const

const __DEV__ = process.env.NODE_ENV !== "production"
const __DEBUG_CRON__ = __DEV__ || process.env.IG_GRAPH_DEBUG === "1"

function todayUtcDateString() {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function ymdFromIsoEndTime(endTime: string) {
  // IG typically returns ISO like "2026-01-12T07:00:00+0000" (or Z).
  // We treat the YYYY-MM-DD portion as the authoritative UTC day key.
  const s = String(endTime || "")
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m?.[1]) return m[1]
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${mm}-${dd}`
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

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  return POST(req)
}

function requireBearer(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return (m?.[1] ?? "").trim()
}

function isVercelCron(req: Request) {
  const v = (req.headers.get("x-vercel-cron") ?? "").trim()
  return Boolean(v)
}

export async function POST(req: Request) {
  try {
    const vercelCron = isVercelCron(req)
    if (!vercelCron) {
      const secret = (process.env.CRON_SECRET ?? "").trim()
      const token = requireBearer(req)
      if (!secret || token !== secret) {
        return NextResponse.json({ ok: false, error: "unauthorized", build_marker: BUILD_MARKER }, { status: 401, headers: baseHeaders })
      }
    }

    if (__DEBUG_CRON__) {
      console.log(
        JSON.stringify({
          status: "cron_invoked",
          vercel_cron: vercelCron,
          has_auth_header: Boolean((req.headers.get("authorization") ?? "").trim()),
        }),
      )
    }

    // Supabase table existence guard (auto).
    // Avoids relying on manual SQL edits/checks.
    try {
      const { error: tableErr } = await supabaseServer.from("ig_daily_insights").select("id").limit(1)
      if (tableErr) {
        const code = (tableErr as any)?.code
        const msg = String((tableErr as any)?.message ?? "")
        const looksMissing = code === "42P01" || /does not exist/i.test(msg) || /relation .* does not exist/i.test(msg)
        if (looksMissing) {
          console.log(
            JSON.stringify({
              status: "missing_table_ig_daily_insights",
              error: { message: msg, code, hint: (tableErr as any)?.hint },
            }),
          )
          return NextResponse.json(
            { ok: false, error: "missing_table_ig_daily_insights", build_marker: BUILD_MARKER },
            { status: 500, headers: baseHeaders },
          )
        }
      }
    } catch (e: any) {
      console.log(JSON.stringify({ status: "missing_table_ig_daily_insights", error: { message: e?.message ?? String(e) } }))
      return NextResponse.json(
        { ok: false, error: "missing_table_ig_daily_insights", build_marker: BUILD_MARKER },
        { status: 500, headers: baseHeaders },
      )
    }

    const today = todayUtcDateString()

    const { data: credsRows, error: credsErr } = await supabaseServer
      .from("ig_credentials")
      .select("ig_user_id,page_id,access_token")

    if (credsErr) {
      return NextResponse.json(
        { ok: false, error: "failed_to_load_credentials", message: credsErr.message, build_marker: BUILD_MARKER },
        { status: 500, headers: baseHeaders },
      )
    }

    const rows = Array.isArray(credsRows) ? credsRows : []

    let upserted = 0
    let skipped = 0

    const GRAPH_BASE = "https://graph.facebook.com/v24.0"

    for (const r of rows as any[]) {
      const igUserIdStr = String(r?.ig_user_id ?? "").trim()
      const pageIdStr = String(r?.page_id ?? "").trim()
      const userToken = String(r?.access_token ?? "").trim()

      if (!igUserIdStr || !pageIdStr || !userToken) {
        skipped++
        continue
      }

      const ig_user_id = Number(igUserIdStr)
      const page_id = Number(pageIdStr)

      if (!Number.isFinite(ig_user_id) || !Number.isFinite(page_id)) {
        skipped++
        continue
      }

      const pageTokenUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageIdStr)}`)
      pageTokenUrl.searchParams.set("fields", "access_token")
      pageTokenUrl.searchParams.set("access_token", userToken)

      const pageTokenRes = await fetch(pageTokenUrl.toString(), { method: "GET", cache: "no-store" })
      const pageTokenBody = await safeJson(pageTokenRes)
      const pageAccessToken = pageTokenRes.ok && typeof pageTokenBody?.access_token === "string" ? String(pageTokenBody.access_token).trim() : ""

      if (!pageAccessToken) {
        skipped++
        continue
      }

      // Pull the last few days so we can persist the last fully completed day(s).
      // We will explicitly filter out "today" to avoid partial-day persistence.
      const untilMs = Date.now()
      const sinceMs = untilMs - 4 * 24 * 60 * 60 * 1000
      const since = Math.floor(sinceMs / 1000)
      const until = Math.floor(untilMs / 1000)

      const insightsUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(igUserIdStr)}/insights`)
      insightsUrl.searchParams.set("metric", "reach,total_interactions,accounts_engaged,impressions")
      insightsUrl.searchParams.set("period", "day")
      insightsUrl.searchParams.set("since", String(since))
      insightsUrl.searchParams.set("until", String(until))
      insightsUrl.searchParams.set("access_token", pageAccessToken)

      const insightsRes = await fetch(insightsUrl.toString(), { method: "GET", cache: "no-store" })
      const insightsBody = await safeJson(insightsRes)

      const data = Array.isArray(insightsBody?.data) ? insightsBody.data : []
      const extractSeries = (name: string) => {
        const it = data.find((x: any) => String(x?.name || "").trim() === name)
        return Array.isArray(it?.values) ? it.values : []
      }

      const reachSeries = extractSeries("reach")
      const interactionsSeries = extractSeries("total_interactions")
      const engagedSeries = extractSeries("accounts_engaged")
      const impressionsSeries = extractSeries("impressions")

      const byDay = new Map<
        string,
        { day: string; reach: number; total_interactions: number; accounts_engaged: number; impressions: number }
      >()

      const ensure = (dayKey: string) => {
        const ex = byDay.get(dayKey)
        if (ex) return ex
        const init = { day: dayKey, reach: 0, total_interactions: 0, accounts_engaged: 0, impressions: 0 }
        byDay.set(dayKey, init)
        return init
      }

      const applySeries = (series: any[], field: "reach" | "total_interactions" | "accounts_engaged" | "impressions") => {
        for (const v of Array.isArray(series) ? series : []) {
          const endTime = typeof v?.end_time === "string" ? v.end_time : ""
          const dayKey = endTime ? ymdFromIsoEndTime(endTime) : null
          if (!dayKey) continue
          if (dayKey >= today) continue // do NOT persist partial "today"
          const rec = ensure(dayKey)
          rec[field] = toSafeInt(v?.value)
        }
      }

      applySeries(reachSeries, "reach")
      applySeries(interactionsSeries, "total_interactions")
      applySeries(engagedSeries, "accounts_engaged")
      applySeries(impressionsSeries, "impressions")

      const completedDays = Array.from(byDay.keys()).sort()
      const lastCompletedDay = completedDays.length ? completedDays[completedDays.length - 1] : null
      if (!lastCompletedDay) {
        skipped++
        continue
      }

      // Persist only the last fully completed day to avoid partial-day drift.
      const payload = byDay.get(lastCompletedDay)!
      const { error: upErr } = await supabaseServer
        .from("ig_daily_insights")
        .upsert(
          {
            ig_user_id,
            page_id,
            day: payload.day,
            reach: payload.reach,
            total_interactions: payload.total_interactions,
            accounts_engaged: payload.accounts_engaged,
            impressions: payload.impressions,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ig_user_id,page_id,day" },
        )

      if (__DEBUG_CRON__) {
        try {
          const start = utcDateStringFromOffset(6)
          const { data: chkRows, error: chkErr } = await supabaseServer
            .from("ig_daily_insights")
            .select("day,reach,impressions,total_interactions,accounts_engaged")
            .eq("ig_user_id", ig_user_id)
            .eq("page_id", page_id)
            .gte("day", start)
            .lte("day", lastCompletedDay)
            .order("day", { ascending: true })

          const list = Array.isArray(chkRows) ? chkRows : []
          const firstDay = list.length > 0 ? (list[0] as any)?.day : null
          const lastDay = list.length > 0 ? (list[list.length - 1] as any)?.day : null

          const status = !upErr && list.length > 0 ? "cron_write_ok" : "cron_write_failed"
          const error = upErr
            ? { message: (upErr as any)?.message ?? String(upErr), code: (upErr as any)?.code, hint: (upErr as any)?.hint }
            : chkErr
              ? { message: (chkErr as any)?.message ?? String(chkErr), code: (chkErr as any)?.code, hint: (chkErr as any)?.hint }
              : null

          console.log(
            JSON.stringify({
              status,
              ig_user_id,
              page_id,
              rows_len: list.length,
              first_day: firstDay,
              last_day: lastDay,
              error,
            }),
          )
        } catch (e: any) {
          console.log(
            JSON.stringify({
              status: "cron_write_failed",
              ig_user_id,
              page_id,
              rows_len: 0,
              first_day: null,
              last_day: null,
              error: { message: e?.message ?? String(e) },
            }),
          )
        }
      }

      if (upErr) {
        skipped++
        continue
      }

      upserted++
    }

    if (__DEBUG_CRON__) {
      console.log(JSON.stringify({ status: "cron_finished", upserted, skipped, total: rows.length }))
    }

    return NextResponse.json(
      { ok: true, day: today, upserted, skipped, total: rows.length, build_marker: BUILD_MARKER },
      { status: 200, headers: baseHeaders },
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: e?.message ?? String(e), build_marker: BUILD_MARKER },
      { status: 500, headers: baseHeaders },
    )
  }
}
