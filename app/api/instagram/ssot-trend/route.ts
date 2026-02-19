import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SsotPoint = { day: string; value: number }

type ActiveAccountResolved = {
  ssotId: string
  igUserId: string
  pageId: string
} | null

function clampDays(raw: string | null): 90 | 60 | 30 | 14 | 7 {
  const n = Number(raw)
  if (n === 90 || n === 60 || n === 30 || n === 14 || n === 7) return n
  return 90
}

function utcDateRangeForDays(days: number): { start: string; end: string } {
  const safeDays = Math.max(1, Math.floor(days || 90))
  const now = new Date()
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  const startMs = endMs - (safeDays - 1) * 24 * 60 * 60 * 1000

  const fmt = (ms: number) => {
    const d = new Date(ms)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${dd}`
  }

  return { start: fmt(startMs), end: fmt(endMs) }
}

async function resolveActiveAccountForSsotTrend(): Promise<ActiveAccountResolved> {
  const authed = await createAuthedClient()
  const userRes = await authed.auth.getUser()
  const user = userRes?.data?.user ?? null
  if (!user?.id) return null

  let c: any = null
  try {
    c = await (cookies() as any)
  } catch {
    c = null
  }

  const cookieAccountId =
    (typeof c?.get === "function" ? String(c.get("ig_account_id")?.value ?? "").trim() : "") ||
    (typeof c?.get === "function" ? String(c.get("ig_active_account_id")?.value ?? "").trim() : "") ||
    (typeof c?.get === "function" ? String(c.get("ig_active_ig_account_id")?.value ?? "").trim() : "")

  if (cookieAccountId) {
    const { data } = await authed
      .from("user_ig_accounts")
      .select("id,ig_user_id,page_id")
      .eq("id", cookieAccountId)
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .limit(1)
      .maybeSingle()

    const ssotId = data && typeof (data as any).id === "string" ? String((data as any).id) : ""
    if (ssotId) {
      const igUserId = data && (data as any).ig_user_id != null ? String((data as any).ig_user_id) : ""
      const pageId = data && (data as any).page_id != null ? String((data as any).page_id) : ""
      if (igUserId && pageId) return { ssotId, igUserId, pageId }
    }
  }

  const { data: activeIg } = await authed
    .from("user_instagram_accounts")
    .select("ig_user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const activeIgUserId = activeIg && (activeIg as any).ig_user_id != null ? String((activeIg as any).ig_user_id) : ""
  if (activeIgUserId) {
    const { data } = await authed
      .from("user_ig_accounts")
      .select("id,ig_user_id,page_id")
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .eq("ig_user_id", activeIgUserId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const ssotId = data && typeof (data as any).id === "string" ? String((data as any).id) : ""
    if (ssotId) {
      const igUserId = data && (data as any).ig_user_id != null ? String((data as any).ig_user_id) : ""
      const pageId = data && (data as any).page_id != null ? String((data as any).page_id) : ""
      if (igUserId && pageId) return { ssotId, igUserId, pageId }
    }
  }

  const { data: fallback } = await authed
    .from("user_ig_accounts")
    .select("id,ig_user_id,page_id")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const ssotId = fallback && typeof (fallback as any).id === "string" ? String((fallback as any).id) : ""
  if (!ssotId) return null
  const igUserId = fallback && (fallback as any).ig_user_id != null ? String((fallback as any).ig_user_id) : ""
  const pageId = fallback && (fallback as any).page_id != null ? String((fallback as any).page_id) : ""
  if (!igUserId || !pageId) return null
  return { ssotId, igUserId, pageId }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))
    const { start: rangeStart, end: rangeEnd } = utcDateRangeForDays(days)

    const resolved = await resolveActiveAccountForSsotTrend()
    if (!resolved) {
      return NextResponse.json({ ok: false, error: "missing_auth" }, { status: 401 })
    }

    // Reach SSOT: must be keyed by a stable SSOT id (ig_account_id) + day.
    // Source of truth: account_daily_snapshot (populated by reach sync/backfill), keyed by (ig_account_id, day).
    const reachRows = await supabaseServer
      .from("account_daily_snapshot")
      .select("day,reach")
      .eq("ig_account_id", resolved.ssotId)
      .gte("day", rangeStart)
      .lte("day", rangeEnd)
      .order("day", { ascending: true })

    // Followers SSOT: must be keyed by the same stable ssotId + day.
    // If this environment's schema does not support `ig_account_id`, return an explicit error.
    const followersRows = await supabaseServer
      .from("ig_daily_followers")
      .select("day,followers_count")
      .eq("ig_account_id", resolved.ssotId as any)
      .gte("day", rangeStart)
      .lte("day", rangeEnd)
      .order("day", { ascending: true })

    if (reachRows.error) {
      return NextResponse.json(
        { ok: false, error: "reach_query_failed", message: (reachRows.error as any)?.message ?? String(reachRows.error) },
        { status: 500 },
      )
    }

    if (followersRows.error) {
      const msg = (followersRows.error as any)?.message ?? String(followersRows.error)
      return NextResponse.json(
        {
          ok: false,
          error: "followers_query_failed",
          message: msg,
          hint: "Followers SSOT requires ig_daily_followers to have an ig_account_id (ssotId) column and be keyed by (ig_account_id, day).",
        },
        { status: 500 },
      )
    }

    const reachSeries: SsotPoint[] = (Array.isArray(reachRows.data) ? reachRows.data : [])
      .map((row: unknown) => {
        const r = row as { day?: unknown; reach?: unknown }
        return { day: String(r?.day ?? ""), value: Number(r?.reach) }
      })
      .filter((p: SsotPoint) => /^\d{4}-\d{2}-\d{2}$/.test(p.day) && Number.isFinite(p.value))

    const followersSeries: SsotPoint[] = (Array.isArray(followersRows.data) ? followersRows.data : [])
      .map((row: unknown) => {
        const r = row as { day?: unknown; followers_count?: unknown }
        return { day: String(r?.day ?? ""), value: Number(r?.followers_count) }
      })
      .filter((p: SsotPoint) => /^\d{4}-\d{2}-\d{2}$/.test(p.day) && Number.isFinite(p.value))

    const available_days = Math.max(reachSeries.length, followersSeries.length)

    return NextResponse.json(
      {
        ok: true,
        rangeStart,
        rangeEnd,
        available_days,
        reachSeries,
        followersSeries,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "server_error", message: e?.message ?? String(e) }, { status: 500 })
  }
}
