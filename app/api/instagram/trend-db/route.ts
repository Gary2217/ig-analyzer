import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "trend-db-v2"

function utcDateStringFromOffset(daysAgo: number): string {
  const now = new Date()
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) -
    daysAgo * 86_400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 90
  return Math.min(Math.max(Math.floor(n), 1), 365)
}

function toFiniteIntOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const days = clampDays(url.searchParams.get("days"))
  const today = utcDateStringFromOffset(0)
  const start = utcDateStringFromOffset(days - 1)

  // Optional: caller may pass the already-resolved ig_account_id UUID to avoid
  // a second DB round-trip. We validate it belongs to the authed user.
  const paramAccountId = (url.searchParams.get("ig_account_id") ?? "").trim()

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", build_marker: BUILD_MARKER },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    }
    const userId = String(user.id)

    // ── Resolve ig_account_id + ig_user_id + page_id ────────────────────────
    // user_ig_accounts.ig_user_id and page_id are TEXT columns.
    // account_daily_snapshot stores them as BIGINT (ig_user_id, page_id).
    let igAccountId = ""
    let igUserIdText = ""   // text from user_ig_accounts
    let pageIdText = ""     // text from user_ig_accounts

    try {
      let row: Record<string, unknown> | null = null

      if (paramAccountId && UUID_RE.test(paramAccountId)) {
        // Validate the supplied UUID belongs to this user
        const { data } = await authed
          .from("user_ig_accounts")
          .select("id,ig_user_id,page_id")
          .eq("id", paramAccountId)
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle()
        row = (data as Record<string, unknown> | null) ?? null
      }

      if (!row) {
        // Fall back to latest connected account for this user
        const { data } = await authed
          .from("user_ig_accounts")
          .select("id,ig_user_id,page_id")
          .eq("user_id", userId)
          .eq("provider", "instagram")
          .is("revoked_at", null)
          .order("connected_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        row = (data as Record<string, unknown> | null) ?? null
      }

      if (row) {
        igAccountId = typeof row.id === "string" ? row.id : ""
        igUserIdText = row.ig_user_id != null ? String(row.ig_user_id) : ""
        pageIdText = row.page_id != null ? String(row.page_id) : ""
      }
    } catch { /* best-effort */ }

    if (!igAccountId) {
      return NextResponse.json(
        { ok: false, error: "no_ig_account", build_marker: BUILD_MARKER },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      )
    }

    // Numeric forms needed for account_daily_snapshot (bigint columns)
    const igUserIdNum = igUserIdText ? Number(igUserIdText) : NaN
    const pageIdNum = pageIdText ? Number(pageIdText) : NaN
    const hasNumericIds = Number.isFinite(igUserIdNum) && igUserIdNum > 0
      && Number.isFinite(pageIdNum) && pageIdNum > 0

    // ── 1. Followers: ig_daily_followers ────────────────────────────────────
    // Primary key: ig_account_id. Legacy fallback: ig_user_id (text).
    let followersRows: Array<{ day: string; followers_count: number }> = []
    let followersLastWriteAt: string | null = null
    try {
      const { data: fRows } = await supabaseServer
        .from("ig_daily_followers")
        .select("day,followers_count,captured_at")
        .eq("ig_account_id", igAccountId)
        .gte("day", start)
        .lte("day", today)
        .order("day", { ascending: true })

      const arr = Array.isArray(fRows) ? fRows : []
      for (const r of arr) {
        const day = typeof (r as any).day === "string" ? String((r as any).day) : ""
        const raw = typeof (r as any).followers_count === "number"
          ? (r as any).followers_count
          : Number((r as any).followers_count)
        if (!day || !Number.isFinite(raw) || raw < 0) continue
        followersRows.push({ day, followers_count: Math.floor(raw) })
        const ca = typeof (r as any).captured_at === "string" ? String((r as any).captured_at) : ""
        if (ca && (!followersLastWriteAt || ca > followersLastWriteAt)) followersLastWriteAt = ca
      }

      // Legacy fallback: ig_user_id text column
      if (followersRows.length === 0 && igUserIdText) {
        const { data: fRowsLegacy } = await supabaseServer
          .from("ig_daily_followers")
          .select("day,followers_count,captured_at")
          .eq("ig_user_id", igUserIdText)
          .gte("day", start)
          .lte("day", today)
          .order("day", { ascending: true })

        const arr2 = Array.isArray(fRowsLegacy) ? fRowsLegacy : []
        for (const r of arr2) {
          const day = typeof (r as any).day === "string" ? String((r as any).day) : ""
          const raw = typeof (r as any).followers_count === "number"
            ? (r as any).followers_count
            : Number((r as any).followers_count)
          if (!day || !Number.isFinite(raw) || raw < 0) continue
          followersRows.push({ day, followers_count: Math.floor(raw) })
          const ca = typeof (r as any).captured_at === "string" ? String((r as any).captured_at) : ""
          if (ca && (!followersLastWriteAt || ca > followersLastWriteAt)) followersLastWriteAt = ca
        }
      }
    } catch { /* best-effort */ }

    // ── 2. Interactions: media_daily_aggregate ───────────────────────────────
    // Keyed by: user_id_text + ig_account_id + day
    const interactionsByDay = new Map<string, number>()
    try {
      const { data: aggRows } = await supabaseServer
        .from("media_daily_aggregate")
        .select("day,total_interactions")
        .eq("user_id_text", userId)
        .eq("ig_account_id", igAccountId)
        .gte("day", start)
        .lte("day", today)
        .order("day", { ascending: true })

      const arr = Array.isArray(aggRows) ? aggRows : []
      for (const r of arr) {
        const day = typeof (r as any).day === "string" ? String((r as any).day) : ""
        const val = toFiniteIntOrNull((r as any).total_interactions)
        if (!day || val === null) continue
        interactionsByDay.set(day, val)
      }
    } catch { /* best-effort */ }

    // ── 3. Reach + account metrics: account_daily_snapshot ──────────────────
    // Unique key: (user_id_text, ig_user_id BIGINT, page_id BIGINT, day)
    // Do NOT filter by ig_account_id — that column is not in the unique index.
    const snapshotByDay = new Map<string, {
      reach: number | null
      impressions: number | null
      total_interactions: number | null
      accounts_engaged: number | null
    }>()
    try {
      if (hasNumericIds) {
        const { data: snapRows } = await supabaseServer
          .from("account_daily_snapshot")
          .select("day,reach,impressions,total_interactions,accounts_engaged")
          .eq("user_id_text", userId)
          .eq("ig_user_id", igUserIdNum)
          .eq("page_id", pageIdNum)
          .gte("day", start)
          .lte("day", today)
          .order("day", { ascending: true })

        const arr = Array.isArray(snapRows) ? snapRows : []
        for (const r of arr) {
          const day = typeof (r as any).day === "string" ? String((r as any).day) : ""
          if (!day) continue
          snapshotByDay.set(day, {
            reach: toFiniteIntOrNull((r as any).reach),
            impressions: toFiniteIntOrNull((r as any).impressions),
            total_interactions: toFiniteIntOrNull((r as any).total_interactions),
            accounts_engaged: toFiniteIntOrNull((r as any).accounts_engaged),
          })
        }
      }
    } catch { /* best-effort */ }

    // ── Build unified points array ───────────────────────────────────────────
    const allDays = new Set<string>()
    for (const r of followersRows) allDays.add(r.day)
    for (const d of interactionsByDay.keys()) allDays.add(d)
    for (const d of snapshotByDay.keys()) allDays.add(d)

    const points = Array.from(allDays)
      .sort()
      .map((day) => {
        const snap = snapshotByDay.get(day)
        const mediaInt = interactionsByDay.get(day) ?? null
        // Prefer account_daily_snapshot.total_interactions; fall back to media_daily_aggregate
        const interactions = snap?.total_interactions ?? mediaInt
        return {
          date: day,
          reach: snap?.reach ?? null,
          impressions: snap?.impressions ?? null,
          interactions,
          engaged_accounts: snap?.accounts_engaged ?? null,
        }
      })

    // ── KPI: last-day value + delta vs previous day ──────────────────────────
    const reachValues = points.map((p) => p.reach).filter((v): v is number => v !== null)
    const interactionValues = points.map((p) => p.interactions).filter((v): v is number => v !== null)
    const followerValues = followersRows.map((r) => r.followers_count)

    const lastReach = reachValues.length > 0 ? reachValues[reachValues.length - 1] : null
    const prevReach = reachValues.length > 1 ? reachValues[reachValues.length - 2] : null
    const lastInteractions = interactionValues.length > 0 ? interactionValues[interactionValues.length - 1] : null
    const prevInteractions = interactionValues.length > 1 ? interactionValues[interactionValues.length - 2] : null
    const lastFollowers = followerValues.length > 0 ? followerValues[followerValues.length - 1] : null
    const prevFollowers = followerValues.length > 1 ? followerValues[followerValues.length - 2] : null

    const kpi = {
      reach: {
        last: lastReach,
        delta: lastReach !== null && prevReach !== null ? lastReach - prevReach : null,
      },
      interactions: {
        last: lastInteractions,
        delta: lastInteractions !== null && prevInteractions !== null ? lastInteractions - prevInteractions : null,
      },
      followers: {
        last: lastFollowers,
        delta: lastFollowers !== null && prevFollowers !== null ? lastFollowers - prevFollowers : null,
      },
    }

    return NextResponse.json(
      {
        ok: true,
        build_marker: BUILD_MARKER,
        days,
        range_start: start,
        range_end: today,
        ig_account_id: igAccountId,
        points,
        followers_daily_rows: followersRows,
        followers_last_write_at: followersLastWriteAt,
        kpi,
        __diag: {
          resolved_ig_account_id: igAccountId,
          resolved_ig_user_id: igUserIdText,
          resolved_page_id: pageIdText,
          has_numeric_ids: hasNumericIds,
          followers_rows: followersRows.length,
          snapshot_days: snapshotByDay.size,
          media_agg_days: interactionsByDay.size,
          points_total: points.length,
          points_with_reach: points.filter((p) => p.reach !== null).length,
          points_with_interactions: points.filter((p) => p.interactions !== null).length,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: msg.slice(0, 300), build_marker: BUILD_MARKER },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
