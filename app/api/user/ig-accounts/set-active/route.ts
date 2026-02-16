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

async function safeJson(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    return null
  }
}

function isUniqueViolation(err: any) {
  const code = typeof err?.code === "string" ? err.code : ""
  if (code === "23505") return true

  const msgRaw =
    typeof err?.message === "string"
      ? err.message
      : typeof err?.details === "string"
        ? err.details
        : ""
  const msg = String(msgRaw || "")
  if (msg.includes("23505")) return true

  const lower = msg.toLowerCase()
  if (lower.includes("duplicate")) return true
  if (lower.includes("unique")) return true
  return false
}

export async function POST(req: NextRequest) {
  try {
    if (!isSaasIgAccountsEnabled()) {
      return NextResponse.json({ ok: false, disabled: true }, { status: 200, headers: JSON_HEADERS })
    }

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: JSON_HEADERS })
    }

    const body: any = await safeJson(req)
    const ig_user_id = typeof body?.ig_user_id === "string" ? body.ig_user_id.trim() : ""
    if (!ig_user_id) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: JSON_HEADERS })
    }

    const { data: existingRow, error: existingErr } = await authed
      .from("user_instagram_accounts")
      .select("ig_user_id")
      .eq("user_id", user.id)
      .eq("ig_user_id", ig_user_id)
      .maybeSingle()

    if (existingErr) {
      return NextResponse.json({ ok: false, error: "failed_to_load" }, { status: 500, headers: JSON_HEADERS })
    }

    if (!existingRow) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: JSON_HEADERS })
    }

    const runSwitch = async () => {
      const { error: clearErr } = await authed
        .from("user_instagram_accounts")
        .update({ is_active: false })
        .eq("user_id", user.id)
        .eq("is_active", true)

      if (clearErr) return { ok: false as const, error: clearErr }

      const { error: setErr } = await authed
        .from("user_instagram_accounts")
        .update({ is_active: true })
        .eq("user_id", user.id)
        .eq("ig_user_id", ig_user_id)

      if (setErr) return { ok: false as const, error: setErr }

      return { ok: true as const }
    }

    const first = await runSwitch()
    if (!first.ok) {
      if (isUniqueViolation((first as any).error)) {
        const second = await runSwitch()
        if (!second.ok) {
          return NextResponse.json({ ok: false, error: "failed_to_update" }, { status: 500, headers: JSON_HEADERS })
        }
      } else {
        return NextResponse.json({ ok: false, error: "failed_to_update" }, { status: 500, headers: JSON_HEADERS })
      }
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: JSON_HEADERS })
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: JSON_HEADERS })
  }
}
