import { NextResponse } from "next/server"

import { fetchTrendPoints, resolveTenant, VALID_METRICS, type TrendMetric, type TrendPoint } from "../_lib/trend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    // Parse requested metrics (comma-separated); default to all
    const metricsRaw = url.searchParams.get("metrics")
    const metrics: TrendMetric[] = metricsRaw
      ? metricsRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is TrendMetric => VALID_METRICS.includes(s as TrendMetric))
      : [...VALID_METRICS]

    if (metrics.length === 0) {
      return NextResponse.json({ error: "INVALID_METRICS" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    }

    const tenantResult = await resolveTenant(url.searchParams.get("days"))
    if (!tenantResult.ok) {
      return NextResponse.json(
        { error: tenantResult.error },
        { status: tenantResult.status, headers: { "Cache-Control": "no-store" } },
      )
    }
    const { tenant } = tenantResult

    // Fetch all metrics in parallel
    const results = await Promise.all(
      metrics.map(async (metric) => {
        const r = await fetchTrendPoints(metric, tenant)
        return { metric, points: r.ok ? r.points : ([] as TrendPoint[]) }
      }),
    )

    const pointsByMetric: Record<string, TrendPoint[]> = {}
    for (const { metric, points } of results) {
      pointsByMetric[metric] = points
    }

    return NextResponse.json(
      { ok: true, ig_account_id: tenant.ig_account_id, days: tenant.days, pointsByMetric },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
