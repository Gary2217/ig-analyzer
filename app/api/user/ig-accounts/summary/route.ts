import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient } from "@/lib/supabase/server"
import { isSaasIgAccountsEnabled } from "@/app/lib/server/featureFlags"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
}

function shortIgId(raw: string) {
  const s = String(raw || "").trim()
  if (!s) return ""
  if (s.length <= 10) return s
  return `${s.slice(0, 4)}…${s.slice(-3)}`
}

function hasPendingIgLinkingCookie(req: NextRequest) {
  // SAFE: only checks presence. Does not read or return token values.
  const keys = [
    "ig_pending_ig_user_id",
    "ig_pending_access_token",
    "ig_pending_expires_at",
  ]
  for (const k of keys) {
    const v = req.cookies.get(k)?.value
    if (typeof v === "string" && v.trim()) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  try {
    const pending = hasPendingIgLinkingCookie(req)

    if (!isSaasIgAccountsEnabled()) {
      return NextResponse.json(
        { ok: false, disabled: true, linked_count: 0, display: null, pending },
        { status: 200, headers: JSON_HEADERS },
      )
    }

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: JSON_HEADERS })
    }

    const { data, error } = await authed
      .from("user_ig_account_identities")
      .select("provider,ig_user_id,updated_at,created_at")
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ ok: false, error: "failed_to_load" }, { status: 500, headers: JSON_HEADERS })
    }

    const rows: any[] = Array.isArray(data) ? data : []
    const linked_count = rows.length
    const top = rows[0]

    const ig_user_id = typeof top?.ig_user_id === "string" ? top.ig_user_id : null
    const updated_at = typeof top?.updated_at === "string" ? top.updated_at : null

    return NextResponse.json(
      {
        ok: true,
        linked_count,
        display: ig_user_id
          ? {
              provider: "instagram",
              ig_user_id,
              ig_user_id_short: shortIgId(ig_user_id),
              updated_at,
            }
          : null,
        pending,
      },
      { status: 200, headers: JSON_HEADERS },
    )
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: JSON_HEADERS })
  }
}
