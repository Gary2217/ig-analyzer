import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { headers } from "next/headers";

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getIsHttps(req: NextRequest, h: Headers) {
  const xfProto = h.get("x-forwarded-proto")?.toLowerCase()
  return xfProto === "https" || req.nextUrl.protocol === "https:"
}

export async function getMeState(req: NextRequest) {
  try {
    const c = await cookies();
    const h = await headers()

    const isHttps = getIsHttps(req, h)
    const baseCookieOptions = {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax" as const,
      path: "/",
    } as const

    const token = (c.get("ig_access_token")?.value ?? "").trim()
    const hasToken = Boolean(token)

    const preferredUsernameRaw = (process.env.IG_PREFERRED_USERNAME ?? "").trim()
    const preferredUsername = preferredUsernameRaw ? preferredUsernameRaw : null

    if (hasToken) {
      try {
        c.set("ig_connected", "1", { ...baseCookieOptions, httpOnly: false })
      } catch {
        // swallow
      }
    }

    const existingPageId = (c.get("ig_page_id")?.value ?? "").trim()
    const existingIgId = (c.get("ig_ig_id")?.value ?? "").trim()
    let pageId = existingPageId
    let igId = existingIgId

    if (hasToken && (!pageId || !igId)) {
      try {
        const graphUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
        graphUrl.searchParams.set("fields", "name,instagram_business_account")
        graphUrl.searchParams.set("access_token", token)

        const r = await fetch(graphUrl.toString(), { method: "GET", cache: "no-store" })
        if (r.ok) {
          const data = (await r.json()) as any
          const list: any[] = Array.isArray(data?.data) ? data.data : []
          const picked = list.find((p) => p?.instagram_business_account?.id)
          const nextPageId = typeof picked?.id === "string" ? picked.id : ""
          const nextIgId = typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id : ""

          if (nextPageId && nextIgId) {
            pageId = nextPageId
            igId = nextIgId
            c.set("ig_page_id", pageId, baseCookieOptions)
            c.set("ig_ig_id", igId, baseCookieOptions)
          }
        }
      } catch {
        // swallow
      }
    }

    const hasIds = Boolean(pageId && igId)

    if (process.env.IG_OAUTH_DEBUG === "1") {
      console.log("[IG_OAUTH_DEBUG] me headers host=", h.get("host"))
      console.log("[IG_OAUTH_DEBUG] me headers x-forwarded-proto=", h.get("x-forwarded-proto"))
      console.log("[IG_OAUTH_DEBUG] me cookie ig_access_token present=", hasToken)
      console.log("[IG_OAUTH_DEBUG] me cookie ig_connected present=", Boolean((c.get("ig_connected")?.value ?? "").trim()))
      console.log("[IG_OAUTH_DEBUG] me cookie ig_page_id present=", Boolean(pageId))
      console.log("[IG_OAUTH_DEBUG] me cookie ig_ig_id present=", Boolean(igId))
      console.log("[IG_OAUTH_DEBUG] me response connected=", hasToken)
      console.log("[IG_OAUTH_DEBUG] me response hasToken=", hasToken)
      console.log("[IG_OAUTH_DEBUG] me response hasIds=", hasIds)
    }

    return {
      connected: hasToken,
      provider: "instagram" as const,
      hasToken,
      hasIds,
      username: hasToken ? preferredUsername : null,
      profile: hasToken ? { username: preferredUsername } : null,
    }
  } catch (err: any) {
    return {
      connected: false,
      provider: "instagram" as const,
      hasToken: false,
      hasIds: false,
      username: null,
      profile: null,
    }
  }
}

export async function GET(req: NextRequest) {
  const body = await getMeState(req)
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
