export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"
import { cookies } from "next/headers"

// ---------------------------------------------------------------------------
// GET /api/health
// Auth required. Returns compact per-user health report:
//   snapshot / thumbnail cache / creator cards / prewarm events
// All queries scoped by user_id and/or ig_account_id. No tokens returned.
// ---------------------------------------------------------------------------

function todayUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Resolve active ig_account_id (same logic as /api/ig/active-account)
// ---------------------------------------------------------------------------
async function resolveActiveAccount(authed: Awaited<ReturnType<typeof createAuthedClient>>, userId: string) {
  let igAccountId = ""
  let igUserId = ""
  let pageId = ""

  try {
    const cookieStore = await cookies()
    const hint =
      cookieStore.get("ig_account_id")?.value?.trim() ||
      cookieStore.get("ig_active_account_id")?.value?.trim() ||
      ""
    if (hint) {
      const { data } = await authed
        .from("user_ig_accounts")
        .select("id, ig_user_id, page_id")
        .eq("id", hint)
        .eq("user_id", userId)
        .eq("provider", "instagram")
        .limit(1)
        .maybeSingle()
      igAccountId = data && typeof (data as any).id === "string" ? String((data as any).id) : ""
      igUserId = data && (data as any).ig_user_id != null ? String((data as any).ig_user_id) : ""
      pageId = data && (data as any).page_id != null ? String((data as any).page_id) : ""
    }
  } catch { /* ignore */ }

  if (!igAccountId) {
    const { data } = await authed
      .from("user_ig_accounts")
      .select("id, ig_user_id, page_id")
      .eq("user_id", userId)
      .eq("provider", "instagram")
      .is("revoked_at", null)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    igAccountId = data && typeof (data as any).id === "string" ? String((data as any).id) : ""
    igUserId = data && (data as any).ig_user_id != null ? String((data as any).ig_user_id) : ""
    pageId = data && (data as any).page_id != null ? String((data as any).page_id) : ""
  }

  return { igAccountId: igAccountId || null, igUserId: igUserId || null, pageId: pageId || null }
}

// ---------------------------------------------------------------------------
// C1: Snapshot health
// ---------------------------------------------------------------------------
async function getSnapshotHealth(igAccountId: string) {
  const today = todayUtc()

  // Latest row
  const { data: latestRow } = await supabaseServer
    .from("account_daily_snapshot")
    .select("day, reach, total_interactions, wrote_at, source_used")
    .eq("ig_account_id", igAccountId)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestDay: string | null = latestRow ? String((latestRow as any).day ?? "") || null : null
  const freshToday = latestDay === today

  // Last 14 days: fetch existing days and compute missing count
  const since14 = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 13)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  })()

  const { data: last14Rows } = await supabaseServer
    .from("account_daily_snapshot")
    .select("day")
    .eq("ig_account_id", igAccountId)
    .gte("day", since14)
    .lte("day", today)

  const existingDays = new Set<string>(
    (Array.isArray(last14Rows) ? last14Rows : []).map((r: any) => String(r?.day ?? ""))
  )
  let missing14 = 0
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    if (!existingDays.has(ds)) missing14++
  }

  return {
    latest_day: latestDay,
    fresh_today: freshToday,
    missing_last_14: missing14,
    latest: latestRow
      ? {
          day: (latestRow as any).day ?? null,
          reach: (latestRow as any).reach ?? null,
          total_interactions: (latestRow as any).total_interactions ?? null,
          wrote_at: (latestRow as any).wrote_at ?? null,
          source_used: (latestRow as any).source_used ?? null,
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// C2: Thumbnail cache health (aggregate counts only)
// ---------------------------------------------------------------------------
async function getThumbnailHealth() {
  const now = nowIso()

  const [refreshingRes, staleSoftRes, dueNextRes, failuresRes] = await Promise.allSettled([
    // refreshing = true
    supabaseServer
      .from("ig_thumbnail_cache")
      .select("url_hash", { count: "exact", head: true })
      .eq("refreshing", true),

    // soft_expires_at <= now (stale/soft-expired)
    supabaseServer
      .from("ig_thumbnail_cache")
      .select("url_hash", { count: "exact", head: true })
      .not("soft_expires_at", "is", null)
      .lte("soft_expires_at", now),

    // next_refresh_at <= now AND refreshing = false (due for refresh)
    supabaseServer
      .from("ig_thumbnail_cache")
      .select("url_hash", { count: "exact", head: true })
      .not("next_refresh_at", "is", null)
      .lte("next_refresh_at", now)
      .eq("refreshing", false),

    // Top 5 refresh_failures values in last 7 days
    supabaseServer
      .from("ig_thumbnail_cache")
      .select("refresh_failures")
      .not("refresh_failures", "is", null)
      .gt("refresh_failures", 0)
      .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .order("refresh_failures", { ascending: false })
      .limit(50),
  ])

  const refreshingCount =
    refreshingRes.status === "fulfilled" ? ((refreshingRes.value as any)?.count ?? null) : null
  const staleSoftCount =
    staleSoftRes.status === "fulfilled" ? ((staleSoftRes.value as any)?.count ?? null) : null
  const dueNextRefreshCount =
    dueNextRes.status === "fulfilled" ? ((dueNextRes.value as any)?.count ?? null) : null

  // Summarise failures distribution
  let failuresTop: Array<{ failures: number; count: number }> = []
  if (failuresRes.status === "fulfilled") {
    const rows: any[] = Array.isArray((failuresRes.value as any)?.data)
      ? (failuresRes.value as any).data
      : []
    const dist = new Map<number, number>()
    for (const r of rows) {
      const f = typeof r?.refresh_failures === "number" ? r.refresh_failures : 0
      dist.set(f, (dist.get(f) ?? 0) + 1)
    }
    failuresTop = [...dist.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 5)
      .map(([failures, count]) => ({ failures, count }))
  }

  return {
    refreshing_count: refreshingCount,
    stale_soft_count: staleSoftCount,
    due_next_refresh_count: dueNextRefreshCount,
    failures_top: failuresTop,
  }
}

// ---------------------------------------------------------------------------
// C3: Creator cards health
// ---------------------------------------------------------------------------
async function getCardsHealth(userId: string) {
  const { data: rows } = await supabaseServer
    .from("creator_cards")
    .select("id, is_owner_card, avatar_url")
    .eq("user_id", userId)

  const cards: any[] = Array.isArray(rows) ? rows : []
  const cardsCount = cards.length
  const ownerTrueCount = cards.filter((c) => c?.is_owner_card === true).length
  const withAvatar = cards.filter((c) => typeof c?.avatar_url === "string" && c.avatar_url.trim()).length
  const avatarCoverage = cardsCount > 0 ? `${withAvatar}/${cardsCount}` : "0/0"

  return { cards_count: cardsCount, owner_true_count: ownerTrueCount, avatar_coverage: avatarCoverage }
}

// ---------------------------------------------------------------------------
// C4: Prewarm events health
// ---------------------------------------------------------------------------
async function getPrewarmEvents(userId: string, igAccountId: string | null) {
  let q = supabaseServer
    .from("user_prewarm_events")
    .select("created_at, ig_account_id, mode, reason, skipped, took_ms, ok")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (igAccountId) {
    q = (q as any).eq("ig_account_id", igAccountId)
  }

  const { data } = await q
  return { recent: Array.isArray(data) ? data : [] }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const t0 = Date.now()

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 })
    }

    const { igAccountId } = await resolveActiveAccount(authed, user.id)

    const [snapRes, thumbRes, cardsRes, prewarmRes] = await Promise.allSettled([
      igAccountId
        ? getSnapshotHealth(igAccountId)
        : Promise.resolve({ skipped: "no_account" as const }),

      getThumbnailHealth(),

      getCardsHealth(user.id),

      getPrewarmEvents(user.id, igAccountId),
    ])

    const snapshot = snapRes.status === "fulfilled" ? snapRes.value : { error: "query_failed" }
    const thumbnails = thumbRes.status === "fulfilled" ? thumbRes.value : { error: "query_failed" }
    const cards = cardsRes.status === "fulfilled" ? cardsRes.value : { error: "query_failed" }
    const prewarm = prewarmRes.status === "fulfilled" ? prewarmRes.value : { recent: [] }

    // Derive warnings from health metrics
    const warnings: string[] = []
    if ("fresh_today" in snapshot && snapshot.fresh_today === false) {
      warnings.push("snapshot_stale")
    }
    if ("refreshing_count" in thumbnails && typeof thumbnails.refreshing_count === "number" && thumbnails.refreshing_count > 0) {
      warnings.push("thumbs_refreshing")
    }
    if ("due_next_refresh_count" in thumbnails && typeof thumbnails.due_next_refresh_count === "number" && thumbnails.due_next_refresh_count > 20) {
      warnings.push("thumbs_due_many")
    }
    if ("cards_count" in cards && "owner_true_count" in cards && typeof cards.cards_count === "number" && cards.cards_count > 0 && cards.owner_true_count !== 1) {
      warnings.push("owner_card_inconsistent")
    }

    return NextResponse.json(
      {
        ok: true,
        now: nowIso(),
        took_ms: Date.now() - t0,
        active_ig_account_id: igAccountId,
        warnings,
        snapshot,
        thumbnails,
        cards,
        prewarm,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg.slice(0, 400) },
      { status: 500 }
    )
  }
}
