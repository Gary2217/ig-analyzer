import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "daily-snapshot-diag-v1"
const HANDLER_FILE = "app/api/instagram/daily-snapshot/diag/route.ts"
const HANDLER_VERSION = "ds-diag-v1"
const HANDLER_HEADERS = {
  "X-Handler-File": HANDLER_FILE,
  "X-Handler-Version": HANDLER_VERSION,
  "X-Handler-Build-Marker": BUILD_MARKER,
} as const

const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
function maskToken(token: string) {
  const t = String(token || "")
  if (!t) return ""
  if (t.length <= 10) return `${t.slice(0, 2)}***${t.slice(-2)}`
  return `${t.slice(0, 4)}***${t.slice(-4)}`
}

function json404() {
  return NextResponse.json(
    { ok: false, build_marker: BUILD_MARKER },
    { status: 404, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
  )
}

function jsonOk(diag: any) {
  return NextResponse.json(
    { ok: true, build_marker: BUILD_MARKER, diag },
    { status: 200, headers: { "Cache-Control": "no-store", ...HANDLER_HEADERS } },
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const env = process.env.NODE_ENV === "production" ? "production" : "development"

  const isProd = env === "production"
  const keyRequired = isProd
  const providedKey = url.searchParams.get("key") || ""
  const expectedKey = (process.env.DAILY_SNAPSHOT_DIAG_KEY ?? "").trim()
  const keyOk = !keyRequired ? true : Boolean(expectedKey) && providedKey === expectedKey
  if (keyRequired && !keyOk) return json404()

  return jsonOk({
    env,
    gating: { key_required: keyRequired, key_ok: keyOk },
  note: "診斷 endpoint 已正常回應",
  })
}
