import { NextResponse } from "next/server"
import { graphGet, type GraphApiError } from "@/lib/instagram/graph"
import type { GraphListResponse, IgMediaDetails, IgMediaListItem, IgInsightsResponse } from "@/lib/instagram/types"

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
  impressions: number | null
  reach: number | null
  saved: number | null
  plays?: number | null
  shares?: number | null
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
  errors?: Array<{ step: string; message: string; status?: number; code?: number; fbtrace_id?: string }>
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
  const data = Array.isArray(insights?.data) ? insights!.data! : []
  for (const item of data) {
    const name = typeof item?.name === "string" ? item.name : ""
    if (!name) continue
    const v = item?.values?.[0]?.value
    out[name] = toIntOrNull(v)
  }
  return out
}

async function fetchInsightsWithFallback(mediaId: string, isReels: boolean): Promise<{ metrics: NormalizedMetrics; errors: NormalizedItem["errors"] }> {
  const errors: NormalizedItem["errors"] = []

  const safeMetrics = ["impressions", "reach", "saved"]
  const reelsExtras = ["plays", "shares"]

  const safeMetricParam = safeMetrics.join(",")
  const extrasMetricParam = reelsExtras.join(",")

  const safeCall = async () => {
    const body = await graphGet<IgInsightsResponse>(`/${mediaId}/insights`, { metric: safeMetricParam })
    const normalized = normalizeInsights(body, safeMetrics)
    return {
      impressions: normalized.impressions ?? null,
      reach: normalized.reach ?? null,
      saved: normalized.saved ?? null,
    } satisfies NormalizedMetrics
  }

  const extrasCall = async () => {
    const body = await graphGet<IgInsightsResponse>(`/${mediaId}/insights`, { metric: extrasMetricParam })
    const normalized = normalizeInsights(body, reelsExtras)
    return {
      plays: normalized.plays ?? null,
      shares: normalized.shares ?? null,
    } satisfies Pick<NormalizedMetrics, "plays" | "shares">
  }

  try {
    const base = await safeCall()
    if (!isReels) return { metrics: base, errors }

    try {
      const extra = await extrasCall()
      return { metrics: { ...base, ...extra }, errors }
    } catch (e: any) {
      if (isUnsupportedMetricError(e)) {
        errors.push({ step: "insights_extras", message: "unsupported_metric", status: e?.status, code: e?.code, fbtrace_id: e?.fbtrace_id })
        return { metrics: base, errors }
      }
      throw e
    }
  } catch (e: any) {
    if (isUnsupportedMetricError(e)) {
      errors.push({ step: "insights_safe", message: "unsupported_metric", status: e?.status, code: e?.code, fbtrace_id: e?.fbtrace_id })
      return { metrics: { impressions: null, reach: null, saved: null, ...(isReels ? { plays: null, shares: null } : null) }, errors }
    }

    errors.push({ step: "insights_safe", message: typeof e?.message === "string" ? e.message : "insights_failed", status: e?.status, code: e?.code, fbtrace_id: e?.fbtrace_id })
    return { metrics: { impressions: null, reach: null, saved: null, ...(isReels ? { plays: null, shares: null } : null) }, errors }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)

  const igUserId = ((process.env.IG_USER_ID ?? "").trim() || "17841404364250644")
  const token = (process.env.IG_ACCESS_TOKEN ?? "").trim()

  if (!igUserId || !token) {
    return NextResponse.json(
      { ok: false, error: "missing_env", missing: [!igUserId ? "IG_USER_ID" : null, !token ? "IG_ACCESS_TOKEN" : null].filter(Boolean) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  const sinceMs = parseSinceMs(url.searchParams.get("since"))
  const maxItemsOverride = parsePosInt(url.searchParams.get("maxItems"))
  const maxPagesOverride = parsePosInt(url.searchParams.get("maxPages"))

  const pageLimit = Math.max(1, Math.min(100, Math.floor(Number(process.env.IG_SYNC_PAGE_LIMIT ?? "25") || 25)))
  const maxPages = Math.max(1, Math.floor(maxPagesOverride ?? (Number(process.env.IG_SYNC_MAX_PAGES ?? "20") || 20)))
  const maxItems = Math.max(1, Math.floor(maxItemsOverride ?? (Number(process.env.IG_SYNC_MAX_ITEMS ?? "500") || 500)))

  const fetchedAt = new Date().toISOString()

  let pageCount = 0
  let after: string | null = null

  const collected: IgMediaListItem[] = []

  while (pageCount < maxPages && collected.length < maxItems) {
    const params: Record<string, string> = {
      fields: "id,caption,media_type,media_url,permalink,timestamp",
      limit: String(pageLimit),
    }
    if (after) params.after = after

    const page = await graphGet<GraphListResponse<IgMediaListItem>>(`/${igUserId}/media`, params)
    const data = Array.isArray(page?.data) ? page.data : []

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
    const nextAfter = typeof page?.paging?.cursors?.after === "string" ? page.paging!.cursors!.after! : ""
    if (!nextAfter) break
    after = nextAfter
  }

  const items: NormalizedItem[] = []

  for (const base of collected) {
    const id = String(base.id)
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

    const insightsRes = await fetchInsightsWithFallback(id, isReels)
    for (const e of insightsRes.errors ?? []) perItemErrors.push(e)

    const item: NormalizedItem = {
      id,
      media_type: details?.media_type ?? (base.media_type ?? null),
      media_product_type,
      permalink: details?.permalink ?? (base.permalink ?? null),
      media_url: base.media_url ?? null,
      thumbnail_url: details?.thumbnail_url ?? null,
      timestamp: details?.timestamp ?? (base.timestamp ?? null),
      caption: details?.caption ?? (typeof base.caption === "string" ? base.caption : null),
      metrics: insightsRes.metrics,
      ...(perItemErrors.length ? { errors: perItemErrors } : null),
    }

    items.push(item)
  }

  return NextResponse.json(
    {
      ok: true,
      igUserId,
      fetchedAt,
      pageCount,
      itemCount: items.length,
      items,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )
}
