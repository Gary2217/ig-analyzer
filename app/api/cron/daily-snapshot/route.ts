import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Required env vars:
//   CRON_SECRET          — shared secret; must match x-cron-secret header
//   CRON_IG_USER_ID      — ig_user_id to snapshot (used by daily-snapshot cronMode)
//   NEXT_PUBLIC_SITE_URL — base URL for internal fetch (e.g. https://ig-analyzer-psl.vercel.app)

const BUILD_MARKER = "cron-daily-snapshot-v1"
const baseHeaders = { "Cache-Control": "no-store", "x-build-marker": BUILD_MARKER } as const

function isVercelCron(req: Request) {
  return req.headers.has("x-vercel-cron")
}

async function runCron(req: Request) {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim()

  // Auth: Vercel cron header OR matching x-cron-secret
  if (!isVercelCron(req)) {
    const provided = (req.headers.get("x-cron-secret") ?? "").trim()
    if (!cronSecret || provided !== cronSecret) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", build_marker: BUILD_MARKER },
        { status: 401, headers: baseHeaders }
      )
    }
  }

  const cronIgUserId = (process.env.CRON_IG_USER_ID ?? "").trim()
  if (!cronIgUserId) {
    return NextResponse.json(
      { ok: false, error: "missing_env:CRON_IG_USER_ID", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "")
  if (!siteUrl) {
    return NextResponse.json(
      { ok: false, error: "missing_env:NEXT_PUBLIC_SITE_URL", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  const targetUrl = `${siteUrl}/api/instagram/daily-snapshot`

  console.log("[cron/daily-snapshot] invoking", { targetUrl, cronIgUserId })

  let downstreamStatus = 0
  let downstreamSnippet = ""

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "x-cron-secret": cronSecret,
        "Content-Type": "application/json",
      },
      // cronMode in daily-snapshot reads IG_ACCESS_TOKEN + IG_USER_ID from env
      // no body needed; the route uses env vars in cronMode
    })

    downstreamStatus = res.status
    const text = await res.text().catch(() => "")
    downstreamSnippet = text.slice(0, 500)

    console.log("[cron/daily-snapshot] done", { downstreamStatus, snippet: downstreamSnippet.slice(0, 200) })

    return NextResponse.json(
      {
        ok: res.ok,
        build_marker: BUILD_MARKER,
        downstream_status: downstreamStatus,
        downstream_body: downstreamSnippet,
      },
      { status: res.ok ? 200 : 502, headers: baseHeaders }
    )
  } catch (e: any) {
    console.error("[cron/daily-snapshot] fetch failed", { message: e?.message ?? String(e) })
    return NextResponse.json(
      {
        ok: false,
        error: "downstream_fetch_failed",
        message: e?.message ?? String(e),
        build_marker: BUILD_MARKER,
        downstream_status: downstreamStatus,
        downstream_body: downstreamSnippet,
      },
      { status: 502, headers: baseHeaders }
    )
  }
}

export async function GET(req: Request) {
  return runCron(req)
}

export async function POST(req: Request) {
  return runCron(req)
}
