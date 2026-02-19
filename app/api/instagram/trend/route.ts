import { NextResponse } from "next/server"

import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TrendMetric = "reach" | "followers" | "impressions" | "accounts_engaged" | "total_interactions"

function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  const i = Math.floor(n)
  if (i < 7) return 7
  if (i > 365) return 365
  return i
}

function utcDayStringFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    const metricRaw = String(url.searchParams.get("metric") ?? "reach").trim()
    const metric: TrendMetric | null =
      metricRaw === "reach" ||
      metricRaw === "followers" ||
      metricRaw === "impressions" ||
      metricRaw === "accounts_engaged" ||
      metricRaw === "total_interactions"
        ? metricRaw
        : null

    if (!metric) {
      return NextResponse.json({ error: "INVALID_METRIC" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    }

    const days = clampDays(url.searchParams.get("days"))

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ error: "missing_auth" }, { status: 401, headers: { "Cache-Control": "no-store" } })
    }

    // Resolve active IG account from DB ONLY. No cookies.
    const { data: activeAccount } = await authed
      .from("user_instagram_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const ig_account_id = activeAccount && typeof (activeAccount as any).id === "string" ? String((activeAccount as any).id).trim() : ""
    if (!ig_account_id) {
      return NextResponse.json({ error: "NO_ACTIVE_IG_ACCOUNT" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    }

    const now = new Date()
    const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    const startMs = endMs - (days - 1) * 24 * 60 * 60 * 1000
    const rangeStart = utcDayStringFromMs(startMs)
    const rangeEnd = utcDayStringFromMs(endMs)

    if (metric === "followers") {
      const r = await supabaseServer
        .from("ig_daily_followers")
        .select("day,followers_count")
        .eq("ig_account_id", ig_account_id as any)
        .gte("day", rangeStart)
        .lte("day", rangeEnd)
        .order("day", { ascending: true })

      if (r.error) {
        return NextResponse.json(
          { error: "QUERY_FAILED", message: (r.error as any)?.message ?? String(r.error) },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        )
      }

      const points = (Array.isArray(r.data) ? r.data : [])
        .map((row: any) => {
          const day = typeof row?.day === "string" ? String(row.day).slice(0, 10) : ""
          const v = typeof row?.followers_count === "number" ? row.followers_count : Number(row?.followers_count)
          if (!day || !Number.isFinite(v)) return null
          return { day, value: Math.floor(v) }
        })
        .filter(Boolean) as Array<{ day: string; value: number }>

      return NextResponse.json(
        { metric, days, ig_account_id, points },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      )
    }

    const col =
      metric === "reach"
        ? "reach"
        : metric === "impressions"
          ? "impressions"
          : metric === "accounts_engaged"
            ? "accounts_engaged"
            : "total_interactions"

    const r = await supabaseServer
      .from("account_daily_snapshot")
      .select(`day,${col}`)
      .eq("ig_account_id", ig_account_id as any)
      .gte("day", rangeStart)
      .lte("day", rangeEnd)
      .order("day", { ascending: true })

    if (r.error) {
      return NextResponse.json(
        { error: "QUERY_FAILED", message: (r.error as any)?.message ?? String(r.error) },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      )
    }

    const points = (Array.isArray(r.data) ? r.data : [])
      .map((row: any) => {
        const day = typeof row?.day === "string" ? String(row.day).slice(0, 10) : ""
        const raw = row?.[col]
        const v = typeof raw === "number" ? raw : Number(raw)
        if (!day || !Number.isFinite(v)) return null
        return { day, value: Math.floor(v) }
      })
      .filter(Boolean) as Array<{ day: string; value: number }>

    return NextResponse.json(
      { metric, days, ig_account_id, points },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
