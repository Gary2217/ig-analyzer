import { NextResponse } from "next/server"
import { graphGet, type GraphApiError } from "@/lib/instagram/graph"
import type { GraphListResponse, IgMediaDetails, IgMediaListItem, IgInsightsResponse } from "@/lib/instagram/types"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/*
Pagination
- Uses cursor pagination via paging.cursors.after.
- Does NOT hardcode paging.next URLs; it requests the next page by passing after=<cursor>.

Metric fallback strategy
- Always request a safe metric set first: impressions,reach,saved.
- Only attempt reels extras (plays,shares) when media_product_type === "REELS".
- If the insights call fails due to unsupported metrics (commonly Graph error code #100), retry with the safe set only.

Why plays/shares are conditional
- Many accounts/media types reject certain metrics with (#100) "Invalid metric".
- Conditional requests prevent a single unsupported metric from breaking the entire sync.
*/

type NormalizedMetrics = {
  [metric: string]: number
}

type NormalizedItem = {
  id: string
  media_type: string | null
  media_product_type: string | null
  permalink: string | null
  media_url: string | null
  thumbnail_url: string | null
  timestamp: string | null
  caption: string | null
  metrics: NormalizedMetrics
  errors?: Array<{ step: string; message: string; metric?: string; status?: number; code?: number; fbtrace_id?: string }>
}

function toIntOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null
}

function parseSinceMs(raw: string | null): number | null {
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

function parsePosInt(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  return i > 0 ? i : null
}

function isUnsupportedMetricError(err: unknown): boolean {
  const e = err as any
  const code = typeof e?.code === "number" ? e.code : undefined
  const msg = typeof e?.message === "string" ? e.message.toLowerCase() : ""
  return code === 100 || msg.includes("invalid") || msg.includes("unsupported") || msg.includes("metric")
}

function normalizeInsights(insights: IgInsightsResponse | null, requested: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const k of requested) out[k] = null
  const data = Array.isArray((insights as any)?.data) ? (insights as any).data : []
  for (const item of data) {
    const name = typeof item?.name === "string" ? item.name : ""
    if (!name) continue
    const v = item?.values?.[0]?.value
    out[name] = toIntOrNull(v)
  }
  return out
}

async function fetchSingleMetric(mediaId: string, metric: string): Promise<number | undefined> {
  const body = await graphGet<IgInsightsResponse>(`/${mediaId}/insights`, { metric })
  const normalized = normalizeInsights(body, [metric])
  const val = normalized[metric]
  return typeof val === "number" && Number.isFinite(val) ? val : undefined
}

async function fetchInsightsResilient(
  mediaId: string,
  isReels: boolean,
): Promise<{ metrics: NormalizedMetrics; errors: NormalizedItem["errors"] }> {
  const errors: NonNullable<NormalizedItem["errors"]> = []
  const metrics: NormalizedMetrics = {}

  const tryMetric = async (metric: string, opts?: { step?: string; onUnsupported?: "skip" | "error" }) => {
    try {
      const v = await fetchSingleMetric(mediaId, metric)
      if (typeof v === "number") metrics[metric] = v
    } catch (e: any) {
      const unsupported = isUnsupportedMetricError(e)
      const onUnsupported = opts?.onUnsupported ?? "error"

      if (unsupported && onUnsupported === "skip") return

      errors.push({
        step: opts?.step ?? "insights_metric",
        message: unsupported ? "unsupported_metric" : typeof e?.message === "string" ? e.message : "metric_failed",
        status: e?.status,
        code: e?.code,
        fbtrace_id: e?.fbtrace_id,
        metric,
      } as any)
    }
  }

  await tryMetric("reach", { step: "insights_metric", onUnsupported: "error" })
  await tryMetric("saved", { step: "insights_metric", onUnsupported: "error" })

  let impressionsUnsupported = false
  try {
    const v = await fetchSingleMetric(mediaId, "impressions")
    if (typeof v === "number") metrics.impressions = v
  } catch (e: any) {
    if (isUnsupportedMetricError(e)) {
      impressionsUnsupported = true
      errors.push({ step: "insights_metric", message: "unsupported_metric", status: e?.status, code: e?.code, fbtrace_id: e?.fbtrace_id, metric: "impressions" } as any)
    } else {
      errors.push({ step: "insights_metric", message: typeof e?.message === "string" ? e.message : "metric_failed", status: e?.status, code: e?.code, fbtrace_id: e?.fbtrace_id, metric: "impressions" } as any)
    }
  }

  if (impressionsUnsupported) {
    await tryMetric("views", { step: "insights_metric", onUnsupported: "error" })
  }

  if (isReels) {
    await tryMetric("plays", { step: "insights_metric", onUnsupported: "skip" })
    await tryMetric("shares", { step: "insights_metric", onUnsupported: "skip" })
  }

  return { metrics, errors: errors.length ? errors : [] }
}

export async function GET(req: Request) {
  const fetchedAt = new Date().toISOString()
  const igUserId = ((process.env.IG_USER_ID ?? "").trim() || "17841404364250644")
  const token = (process.env.IG_ACCESS_TOKEN ?? "").trim()

  const json = (payload: { ok: boolean; igUserId: string; fetchedAt: string; pageCount: number; itemCount: number; items: NormalizedItem[] }, status = 200) =>
    NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } })

  try {
    const url = new URL(req.url)

    if (!igUserId || !token) {
      return json({ ok: false, igUserId: igUserId || "", fetchedAt, pageCount: 0, itemCount: 0, items: [] }, 500)
    }

    try {
      const profile = await graphGet<any>(`/${igUserId}`, { fields: "followers_count" })
      const followersCountRaw = (profile as any)?.followers_count
      const followersCount = typeof followersCountRaw === "number" && Number.isFinite(followersCountRaw) ? Math.floor(followersCountRaw) : null

      if (followersCount !== null) {
        const { data: ssotAccount } = await supabaseServer
          .from("user_instagram_accounts")
          .select("id")
          .eq("ig_user_id", igUserId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()

        const ssotId = ssotAccount && typeof (ssotAccount as any).id === "string" ? String((ssotAccount as any).id) : ""
        if (ssotId) {
          const today = new Date().toISOString().slice(0, 10)
          await supabaseServer.from("ig_daily_followers").upsert(
            {
              ig_account_id: ssotId,
              day: today,
              followers_count: followersCount,
              captured_at: new Date().toISOString(),
            } as any,
            {
              onConflict: "ig_account_id,day",
            },
          )
        }
      }
    } catch {
      // ignore followers snapshot persistence; do not break sync
    }

    const sinceMs = parseSinceMs(url.searchParams.get("since"))
    const maxItemsOverride = parsePosInt(url.searchParams.get("maxItems"))
    const maxPagesOverride = parsePosInt(url.searchParams.get("maxPages"))

    const pageLimit = Math.max(1, Math.min(100, Math.floor(Number(process.env.IG_SYNC_PAGE_LIMIT ?? "25") || 25)))
    const maxPages = Math.max(1, Math.floor(maxPagesOverride ?? (Number(process.env.IG_SYNC_MAX_PAGES ?? "20") || 20)))
    const maxItems = Math.max(1, Math.floor(maxItemsOverride ?? (Number(process.env.IG_SYNC_MAX_ITEMS ?? "500") || 500)))

    let pageCount = 0
    let after: string | null = null
    const collected: IgMediaListItem[] = []

    while (pageCount < maxPages && collected.length < maxItems) {
      const params: Record<string, string> = {
        fields: "id,caption,media_type,media_url,permalink,timestamp",
        limit: String(pageLimit),
      }
      if (after) params.after = after

      let page: GraphListResponse<IgMediaListItem> | null = null
      try {
        page = await graphGet<GraphListResponse<IgMediaListItem>>(`/${igUserId}/media`, params)
      } catch {
        break
      }

      const data = Array.isArray((page as any)?.data) ? (page as any).data : []

      for (const it of data) {
        if (!it?.id) continue
        if (sinceMs !== null) {
          const ts = typeof it.timestamp === "string" ? it.timestamp : ""
          const ms = ts ? Date.parse(ts) : NaN
          if (Number.isFinite(ms) && ms < sinceMs) continue
        }
        collected.push(it)
        if (collected.length >= maxItems) break
      }

      pageCount += 1
      const nextAfter = typeof (page as any)?.paging?.cursors?.after === "string" ? (page as any).paging.cursors.after : ""
      if (!nextAfter) break
      after = nextAfter
    }

    const items: NormalizedItem[] = []

    for (const base of collected) {
      const id = String(base?.id ?? "")
      if (!id) continue

      const perItemErrors: NonNullable<NormalizedItem["errors"]> = []

      let details: IgMediaDetails | null = null
      try {
        details = await graphGet<IgMediaDetails>(`/${id}`, {
          fields: "id,media_type,media_product_type,permalink,timestamp,thumbnail_url,caption",
        })
      } catch (e: any) {
        const ge = e as GraphApiError
        perItemErrors.push({ step: "media_details", message: typeof ge?.message === "string" ? ge.message : "details_failed", status: ge?.status, code: ge?.code, fbtrace_id: ge?.fbtrace_id })
        details = null
      }

      const media_product_type = details?.media_product_type ?? null
      const isReels = String(media_product_type || "").toUpperCase() === "REELS"

      let insightsRes: { metrics: NormalizedMetrics; errors: NormalizedItem["errors"] } = { metrics: {}, errors: [] }
      try {
        insightsRes = await fetchInsightsResilient(id, isReels)
      } catch (e: any) {
        perItemErrors.push({ step: "insights_metric", message: typeof e?.message === "string" ? e.message : "insights_failed" })
      }
      for (const e of insightsRes.errors ?? []) perItemErrors.push(e as any)

      const item: NormalizedItem = {
        id,
        media_type: details?.media_type ?? (base.media_type ?? null),
        media_product_type,
        permalink: details?.permalink ?? (base.permalink ?? null),
        media_url: base.media_url ?? null,
        thumbnail_url: details?.thumbnail_url ?? null,
        timestamp: details?.timestamp ?? (base.timestamp ?? null),
        caption: details?.caption ?? (typeof base.caption === "string" ? base.caption : null),
        metrics: insightsRes.metrics && typeof insightsRes.metrics === "object" ? insightsRes.metrics : {},
        ...(perItemErrors.length ? { errors: perItemErrors } : null),
      }

      items.push(item)
    }

    return json({ ok: true, igUserId, fetchedAt, pageCount, itemCount: items.length, items }, 200)
  } catch {
    return json({ ok: false, igUserId: igUserId || "", fetchedAt, pageCount: 0, itemCount: 0, items: [] }, 500)
  }
}
