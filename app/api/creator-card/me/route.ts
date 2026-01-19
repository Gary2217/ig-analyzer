import { NextResponse, type NextRequest } from "next/server"
import { cookies, headers } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function debugLogCreatorCardShape(card: unknown) {
  if (process.env.DEBUG_CREATOR_CARD !== "1") return
  const c = asRecord(card)
  if (!c) {
    console.log("[creator-card/me][debug] card is not an object")
    return
  }

  const keys = Object.keys(c).sort()
  const contactVal = c.contact
  const contactType = contactVal === null ? "null" : Array.isArray(contactVal) ? "array" : typeof contactVal
  const contactLen = typeof contactVal === "string" ? contactVal.length : null

  const readStrArrLen = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).length : 0)
  const readStrLen = (v: unknown) => (typeof v === "string" ? v.trim().length : 0)

  const nestedContactObj = asRecord(contactVal)
  const nestedEmailsLen = nestedContactObj ? readStrArrLen(nestedContactObj.emails) : null
  const nestedInstagramsLen = nestedContactObj ? readStrArrLen(nestedContactObj.instagrams) : null
  const nestedOthersLen = nestedContactObj ? readStrArrLen(nestedContactObj.others) : null
  const nestedEmailKeyType = nestedContactObj ? (Array.isArray(nestedContactObj.email) ? "array" : typeof nestedContactObj.email) : null
  const nestedInstagramKeyType = nestedContactObj ? (Array.isArray(nestedContactObj.instagram) ? "array" : typeof nestedContactObj.instagram) : null
  const nestedOtherKeyType = nestedContactObj ? (Array.isArray(nestedContactObj.other) ? "array" : typeof nestedContactObj.other) : null

  console.log("[creator-card/me][debug] card keys:", keys)
  console.log("[creator-card/me][debug] contact:", { type: contactType, stringLen: contactLen })
  console.log("[creator-card/me][debug] top-level contact fields:", {
    emailsLen: readStrArrLen(c.emails),
    instagramsLen: readStrArrLen(c.instagrams),
    othersLen: readStrArrLen(c.others),
    contactEmailLen: readStrLen(c.contactEmail),
    contactInstagramLen: readStrLen(c.contactInstagram),
    contactOtherLen: readStrLen(c.contactOther),
  })
  console.log("[creator-card/me][debug] nested contact fields:", {
    emailsLen: nestedEmailsLen,
    instagramsLen: nestedInstagramsLen,
    othersLen: nestedOthersLen,
    emailType: nestedEmailKeyType,
    instagramType: nestedInstagramKeyType,
    otherType: nestedOtherKeyType,
  })
}

function getIsHttps(req: NextRequest, h: Headers) {
  const xfProto = h.get("x-forwarded-proto")?.toLowerCase()
  return xfProto === "https" || req.nextUrl.protocol === "https:"
}

async function resolveIgIdentity(req: NextRequest): Promise<{ igUserId: string | null; igUsername: string | null; pageId?: string | null }> {
  const c = await cookies()
  const h = await headers()

  const cookieIgId = (c.get("ig_ig_id")?.value ?? "").trim()
  const cookiePageId = (c.get("ig_page_id")?.value ?? "").trim()
  const accessToken = (c.get("ig_access_token")?.value ?? "").trim()

  const igUserId = cookieIgId || (c.get("ig_user_id")?.value ?? "").trim() || null
  const igUsername = (c.get("ig_username")?.value ?? "").trim() || null

  if (igUserId) return { igUserId, igUsername, pageId: cookiePageId || null }
  if (!accessToken) return { igUserId: null, igUsername: null }

  // Best-effort: derive ig_ig_id + ig_page_id from access token and persist as cookies.
  try {
    const graphUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
    graphUrl.searchParams.set("fields", "name,instagram_business_account")
    graphUrl.searchParams.set("access_token", accessToken)

    const r = await fetch(graphUrl.toString(), { method: "GET", cache: "no-store" })
    if (!r.ok) return { igUserId: null, igUsername: null }
    const bodyUnknown: unknown = await r.json().catch(() => null)
    const body = asRecord(bodyUnknown)
    const list = Array.isArray(body?.data) ? body.data : []
    const picked = Array.isArray(list)
      ? list
          .map((x) => asRecord(x))
          .find((p) => {
            const iba = asRecord(p?.instagram_business_account)
            return typeof iba?.id === "string" && Boolean(iba.id)
          })
      : null
    const nextPageId = typeof picked?.id === "string" ? picked.id : ""
    const iba = asRecord(picked?.instagram_business_account)
    const nextIgId = typeof iba?.id === "string" ? iba.id : ""

    if (!nextPageId || !nextIgId) return { igUserId: null, igUsername: null }

    const baseCookieOptions = {
      httpOnly: true,
      secure: getIsHttps(req, h),
      sameSite: "lax" as const,
      path: "/",
    } as const

    c.set("ig_page_id", nextPageId, baseCookieOptions)
    c.set("ig_ig_id", nextIgId, baseCookieOptions)

    return { igUserId: nextIgId, igUsername: null, pageId: nextPageId }
  } catch {
    return { igUserId: null, igUsername: null }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { igUserId, igUsername } = await resolveIgIdentity(req)

    if (!igUserId) {
      return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 })
    }

    const { data, error } = await supabaseServer
      .from("creator_cards")
      .select("*, portfolio")
      .eq("ig_user_id", igUserId)
      .limit(1)
      .maybeSingle()

    if (error) {
      const errObj = asRecord(error as unknown)
      if (typeof errObj?.message === "string" && errObj.message.includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const row = asRecord(data as unknown)
    const card =
      row
        ? {
            ...row,
            collaborationNiches: Array.isArray(row.collaboration_niches) ? row.collaboration_niches : null,
            pastCollaborations: Array.isArray(row.past_collaborations) ? row.past_collaborations : null,
            themeTypes: Array.isArray(row.theme_types) ? row.theme_types : null,
            audienceProfiles: Array.isArray(row.audience_profiles) ? row.audience_profiles : null,
          }
        : null

    debugLogCreatorCardShape(card)

    return NextResponse.json({ ok: true, me: { igUserId, igUsername }, card })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
