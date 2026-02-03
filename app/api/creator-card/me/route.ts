import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
}

function shouldDebug() {
  return process.env.NODE_ENV !== "production" || process.env.CREATOR_CARD_DEBUG === "1"
}

export async function GET(req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 200, headers: JSON_HEADERS })
    }

    const fetchCardByUserId = async (client: any) => {
      return await client.from("creator_cards").select("*, portfolio").eq("user_id", user.id).limit(1).maybeSingle()
    }

    const cookieStore = await cookies()
    const cookieIgUserId = (
      cookieStore.get("ig_user_id")?.value ??
      cookieStore.get("igUserId")?.value ??
      ""
    ).trim()

    const fetchCardByIgUserIdForClaim = async (client: any, igUserId: string) => {
      return await client
        .from("creator_cards")
        .select("*, portfolio")
        .eq("ig_user_id", igUserId)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    let data: any = null
    let error: any = null

    {
      const r = await fetchCardByUserId(authed)
      data = (r as any)?.data
      error = (r as any)?.error
    }

    if (error) {
      const msg = typeof (error as any)?.message === "string" ? String((error as any).message) : ""
      const code = typeof (error as any)?.code === "string" ? String((error as any).code) : ""
      const missingUserIdColumn = code === "42703" || (msg.toLowerCase().includes("user_id") && msg.toLowerCase().includes("column"))

      if (missingUserIdColumn) {
        console.error("[creator-card/me] schema missing user_id", {
          code,
          message: msg,
        })
        return NextResponse.json({ ok: false, error: "schema_missing_user_id" }, { status: 200, headers: JSON_HEADERS })
      }

      if (!missingUserIdColumn && (code === "42501" || msg.toLowerCase().includes("permission denied"))) {
        const r2 = await fetchCardByUserId(supabaseServer)
        data = (r2 as any)?.data
        error = (r2 as any)?.error
      }
    }

    if (error) {
      const errObj = asRecord(error as unknown)
      if (typeof errObj?.message === "string" && errObj.message.includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: JSON_HEADERS })
    }

    if (!data && cookieIgUserId) {
      try {
        const claim = await authed
          .rpc("claim_creator_card_legacy", { p_ig_user_id: cookieIgUserId, p_user_id: user.id })
          .maybeSingle()

        if (!(claim as any)?.error && (claim as any)?.data) {
          data = (claim as any).data
          error = null
          if (shouldDebug()) {
            const claimedId = typeof (data as any)?.id === "string" ? String((data as any).id) : null
            console.log("[creator-card/me] legacy card claimed", { id: claimedId })
          }
        } else {
          const claimErr = (claim as any)?.error
          if (claimErr && shouldDebug()) {
            console.log("[creator-card/me] legacy claim rpc failed", {
              message: typeof claimErr?.message === "string" ? claimErr.message : "unknown",
              code: typeof claimErr?.code === "string" ? claimErr.code : null,
            })
          }

          const legacyRes = await fetchCardByIgUserIdForClaim(supabaseServer, cookieIgUserId)
          const legacyRow = (legacyRes as any)?.data
          const legacyErr = (legacyRes as any)?.error
          if (legacyErr) {
            if (shouldDebug()) {
              console.log("[creator-card/me] legacy lookup failed", {
                message: typeof legacyErr?.message === "string" ? legacyErr.message : "unknown",
                code: typeof legacyErr?.code === "string" ? legacyErr.code : null,
              })
            }
          } else if (legacyRow && typeof legacyRow === "object") {
            data = legacyRow
            error = null
          }
        }
      } catch (e2: unknown) {
        if (shouldDebug()) {
          const errObj2 = asRecord(e2)
          console.log("[creator-card/me] legacy claim unexpected error", {
            message: typeof errObj2?.message === "string" ? errObj2.message : "unknown",
          })
        }
      }
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "no_creator_card" }, { status: 200, headers: JSON_HEADERS })
    }

    const row = asRecord(data as unknown)
    const card =
      row
        ? {
            ...row,
            profileImageUrl: typeof row.profile_image_url === "string" ? row.profile_image_url : null,
            avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
            minPrice:
              typeof (row as any).minPrice === "number"
                ? (row as any).minPrice
                : typeof row.min_price === "number"
                  ? row.min_price
                  : null,
            collaborationNiches: Array.isArray(row.collaboration_niches) ? row.collaboration_niches : null,
            pastCollaborations: Array.isArray(row.past_collaborations) ? row.past_collaborations : null,
            themeTypes: Array.isArray(row.theme_types) ? row.theme_types : null,
            audienceProfiles: Array.isArray(row.audience_profiles) ? row.audience_profiles : null,
            featuredItems: Array.isArray(row.featured_items) ? row.featured_items : [],
          }
        : null

    const igUserId = row && typeof row.ig_user_id === "string" ? row.ig_user_id : null
    const igUsername = row && typeof row.ig_username === "string" ? row.ig_username : null

    return NextResponse.json({ ok: true, me: { igUserId, igUsername }, card }, { status: 200, headers: JSON_HEADERS })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: JSON_HEADERS })
  }
}
