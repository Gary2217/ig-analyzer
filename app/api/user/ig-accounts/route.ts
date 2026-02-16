import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient } from "@/lib/supabase/server"
import { isSaasIgAccountsEnabled } from "@/app/lib/server/featureFlags"
import { listUserIgAccountIdentitiesForAuthedUser } from "@/app/lib/server/userIgAccounts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
}

type AccountDto = {
  provider: "instagram"
  ig_user_id: string
  has_token: boolean
  token_expires_at: string | null
  identity_created_at: string | null
  identity_updated_at: string | null
}

export async function GET(_req: NextRequest) {
  try {
    if (!isSaasIgAccountsEnabled()) {
      return NextResponse.json(
        { ok: false, disabled: true, accounts: [] as AccountDto[] },
        { status: 200, headers: JSON_HEADERS },
      )
    }

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: JSON_HEADERS })
    }

    const identitiesRes = await listUserIgAccountIdentitiesForAuthedUser(authed, { provider: "instagram" })
    if (identitiesRes.error) {
      return NextResponse.json({ ok: false, error: "failed_to_load" }, { status: 500, headers: JSON_HEADERS })
    }

    const identities = identitiesRes.rows
      .slice()
      .sort((a, b) => {
        const au = Date.parse(String(a.updated_at || "")) || 0
        const bu = Date.parse(String(b.updated_at || "")) || 0
        if (bu !== au) return bu - au
        const ac = Date.parse(String(a.created_at || "")) || 0
        const bc = Date.parse(String(b.created_at || "")) || 0
        return bc - ac
      })

    const igIds = identities.map((r) => String(r.ig_user_id || "").trim()).filter(Boolean)

    const tokenMap = new Map<string, { expires_at: string | null }>()

    if (igIds.length) {
      const { data: tokenRows, error: tokenErr } = await authed
        .from("user_ig_account_tokens")
        .select("ig_user_id,expires_at")
        .eq("user_id", user.id)
        .eq("provider", "instagram")
        .in("ig_user_id", igIds)

      if (!tokenErr && Array.isArray(tokenRows)) {
        for (const row of tokenRows as any[]) {
          const ig_user_id = typeof row?.ig_user_id === "string" ? row.ig_user_id : ""
          if (!ig_user_id) continue
          tokenMap.set(ig_user_id, {
            expires_at: typeof row?.expires_at === "string" ? row.expires_at : null,
          })
        }
      }
    }

    const accounts: AccountDto[] = identities.map((idRow) => {
      const ig_user_id = String(idRow.ig_user_id || "").trim()
      const token = ig_user_id ? tokenMap.get(ig_user_id) : undefined

      return {
        provider: "instagram",
        ig_user_id,
        has_token: Boolean(token),
        token_expires_at: token?.expires_at ?? null,
        identity_created_at: typeof idRow.created_at === "string" ? idRow.created_at : null,
        identity_updated_at: typeof idRow.updated_at === "string" ? idRow.updated_at : null,
      }
    })

    return NextResponse.json({ ok: true, accounts }, { status: 200, headers: JSON_HEADERS })
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: JSON_HEADERS })
  }
}
