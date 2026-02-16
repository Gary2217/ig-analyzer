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

type AccountRow = {
  ig_user_id: string
  username: string | null
  profile_picture_url: string | null
  is_active: boolean
  updated_at: string | null
  created_at: string | null
}

export async function GET(_req: NextRequest) {
  try {
    if (!isSaasIgAccountsEnabled()) {
      return NextResponse.json(
        { ok: false, disabled: true, accounts: [] as AccountRow[] },
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
      .from("user_instagram_accounts")
      .select("ig_user_id,username,profile_picture_url,is_active,updated_at,created_at")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ ok: false, error: "failed_to_load" }, { status: 500, headers: JSON_HEADERS })
    }

    const rows: any[] = Array.isArray(data) ? data : []

    const accounts: AccountRow[] = rows
      .map((r) => {
        const ig_user_id = typeof r?.ig_user_id === "string" ? r.ig_user_id.trim() : ""
        if (!ig_user_id) return null
        return {
          ig_user_id,
          username: typeof r?.username === "string" ? r.username : null,
          profile_picture_url: typeof r?.profile_picture_url === "string" ? r.profile_picture_url : null,
          is_active: typeof r?.is_active === "boolean" ? r.is_active : false,
          updated_at: typeof r?.updated_at === "string" ? r.updated_at : null,
          created_at: typeof r?.created_at === "string" ? r.created_at : null,
        }
      })
      .filter(Boolean) as AccountRow[]

    return NextResponse.json({ ok: true, accounts }, { status: 200, headers: JSON_HEADERS })
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: JSON_HEADERS })
  }
}
