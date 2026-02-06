import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "daily-snapshot-diag-v2"

function jsonOk(data: any) {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Handler-Build-Marker": BUILD_MARKER,
    },
  })
}

function getDiagData(req: Request) {
  // Check cron mode status (safe, no secrets)
  const cronSecretHeader = req.headers.get("x-cron-secret")
  const cronSecretEnv = (process.env.CRON_SECRET ?? "").trim()
  const cronModeExpected = Boolean(cronSecretHeader && cronSecretEnv)
  
  const igPageIdEnv = (process.env.IG_PAGE_ID ?? "").trim()
  const igIgIdEnv = (process.env.IG_IG_ID ?? "").trim()
  const igAccessTokenEnv = (process.env.IG_ACCESS_TOKEN ?? "").trim()
  const igUserIdEnv = (process.env.IG_USER_ID ?? "").trim()

  return {
    ok: true,
    build_marker: BUILD_MARKER,
    methods: {
      get: true,
      post: true,
    },
    cron: {
      header_present: Boolean(cronSecretHeader),
      cron_secret_env_present: Boolean(cronSecretEnv),
      cron_mode_expected: cronModeExpected,
    },
    env: {
      has_ig_page_id: Boolean(igPageIdEnv),
      has_ig_ig_id: Boolean(igIgIdEnv),
      has_ig_access_token: Boolean(igAccessTokenEnv),
      has_ig_user_id: Boolean(igUserIdEnv),
    },
    time: {
      now_iso: new Date().toISOString(),
    },
  }
}

export async function GET(req: Request) {
  return jsonOk(getDiagData(req))
}

export async function POST(req: Request) {
  return jsonOk(getDiagData(req))
}
