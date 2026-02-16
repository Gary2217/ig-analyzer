import { NextResponse, type NextRequest } from "next/server"
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

export async function GET(req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 200, headers: JSON_HEADERS })
    }

    const cookieIgUserId = (
      req.cookies.get("ig_user_id")?.value ??
      req.cookies.get("igUserId")?.value ??
      ""
    ).trim()

    const fetchCardByUserId = async (client: any) => {
      return await client
        .from("creator_cards")
        .select("*, portfolio")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    const fetchCardByUserIdAndIgUserId = async (client: any, igUserId: string) => {
      return await client
        .from("creator_cards")
        .select("*, portfolio")
        .eq("user_id", user.id)
        .eq("ig_user_id", igUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    let data: any = null
    let error: any = null

    {
      const r = cookieIgUserId
        ? ((await fetchCardByUserIdAndIgUserId(authed, cookieIgUserId)) as any)
        : ((await fetchCardByUserId(authed)) as any)

      if (cookieIgUserId && !r?.error && !r?.data) {
        const r2 = await fetchCardByUserId(authed)
        data = (r2 as any)?.data
        error = (r2 as any)?.error
      } else {
        data = (r as any)?.data
        error = (r as any)?.error
      }
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
        const r2 = cookieIgUserId
          ? ((await fetchCardByUserIdAndIgUserId(supabaseServer, cookieIgUserId)) as any)
          : ((await fetchCardByUserId(supabaseServer)) as any)

        if (cookieIgUserId && !r2?.error && !r2?.data) {
          const r3 = await fetchCardByUserId(supabaseServer)
          data = (r3 as any)?.data
          error = (r3 as any)?.error
        } else {
          data = (r2 as any)?.data
          error = (r2 as any)?.error
        }
      }
    }

    if (error) {
      const errObj = asRecord(error as unknown)
      if (typeof errObj?.message === "string" && errObj.message.includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: JSON_HEADERS })
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
