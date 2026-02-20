import { NextResponse } from "next/server"

import { fetchTrendPoints, resolveTenant, VALID_METRICS } from "../_lib/trend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    const metricRaw = String(url.searchParams.get("metric") ?? "reach").trim()
    const metric = VALID_METRICS.includes(metricRaw as any) ? (metricRaw as (typeof VALID_METRICS)[number]) : null

    if (!metric) {
      return NextResponse.json({ error: "INVALID_METRIC" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    }

    const tenantResult = await resolveTenant(url.searchParams.get("days"))
    if (!tenantResult.ok) {
      return NextResponse.json({ error: tenantResult.error }, { status: tenantResult.status, headers: { "Cache-Control": "no-store" } })
    }
    const { tenant } = tenantResult

    const result = await fetchTrendPoints(metric, tenant)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(
      { metric, days: tenant.days, ig_account_id: tenant.ig_account_id, points: result.points },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
