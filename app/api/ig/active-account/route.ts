export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

// ---------------------------------------------------------------------------
// GET /api/ig/active-account
// Auth required. Returns the resolved active ig_account_id for the current user.
// Uses the same safe resolution logic as /api/prewarm (no cookie parsing on client).
// Response: { ig_account_id: string | null }
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ ig_account_id: null }, { status: 401 })
    }

    // Try cookie hint first (HttpOnly cookies are readable server-side)
    let igAccountId = ""
    try {
      const cookieStore = await cookies()
      const cookieHint =
        cookieStore.get("ig_account_id")?.value?.trim() ||
        cookieStore.get("ig_active_account_id")?.value?.trim() ||
        ""
      if (cookieHint) {
        const { data: acct } = await authed
          .from("user_ig_accounts")
          .select("id")
          .eq("id", cookieHint)
          .eq("user_id", user.id)
          .eq("provider", "instagram")
          .limit(1)
          .maybeSingle()
        igAccountId = acct && typeof (acct as any).id === "string" ? String((acct as any).id) : ""
      }
    } catch { /* ignore cookie errors */ }

    // Fallback: latest connected account for this user
    if (!igAccountId) {
      const { data: latest } = await authed
        .from("user_ig_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "instagram")
        .is("revoked_at", null)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      igAccountId = latest && typeof (latest as any).id === "string" ? String((latest as any).id) : ""
    }

    return NextResponse.json(
      { ig_account_id: igAccountId || null },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ig_account_id: null, error: msg.slice(0, 200) },
      { status: 500 }
    )
  }
}
