import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { headers } from "next/headers";

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function pickProfile(raw: any): {
  username?: string | null
  name?: string | null
  profile_picture_url?: string | null
  followers_count?: number | string | null
  follows_count?: number | string | null
  media_count?: number | string | null
} {
  const p = raw && typeof raw === "object" ? raw : null
  return {
    username: typeof p?.username === "string" ? p.username : null,
    name: typeof p?.name === "string" ? p.name : null,
    profile_picture_url: typeof p?.profile_picture_url === "string" ? p.profile_picture_url : null,
    followers_count:
      typeof p?.followers_count === "number" || typeof p?.followers_count === "string" ? p.followers_count : null,
    follows_count:
      typeof p?.follows_count === "number" || typeof p?.follows_count === "string" ? p.follows_count : null,
    media_count: typeof p?.media_count === "number" || typeof p?.media_count === "string" ? p.media_count : null,
  }
}

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

    let profile: any = hasToken ? { username: preferredUsername } : null
    let profileError: string | null = null

    if (hasToken && hasIds) {
      // Try IG Graph API (Business/Creator) first. This typically requires a Page access token.
      const graphBase = "https://graph.facebook.com/v21.0"
      let pageAccessToken: string | null = null

      try {
        const pageTokenUrl = new URL(`${graphBase}/${encodeURIComponent(pageId)}`)
        pageTokenUrl.searchParams.set("fields", "access_token")
        pageTokenUrl.searchParams.set("access_token", token)
        const pageTokenRes = await fetch(pageTokenUrl.toString(), { method: "GET", cache: "no-store" })
        const pageTokenBody = await safeJson(pageTokenRes)
        if (pageTokenRes.ok && typeof pageTokenBody?.access_token === "string" && pageTokenBody.access_token.trim()) {
          pageAccessToken = pageTokenBody.access_token.trim()
        }
      } catch {
        // swallow
      }

      try {
        const igProfileUrl = new URL(`${graphBase}/${encodeURIComponent(igId)}`)
        igProfileUrl.searchParams.set(
          "fields",
          "id,username,name,profile_picture_url,followers_count,follows_count,media_count",
        )
        igProfileUrl.searchParams.set("access_token", pageAccessToken || token)
        const igProfileRes = await fetch(igProfileUrl.toString(), { method: "GET", cache: "no-store" })
        const igProfileBody = await safeJson(igProfileRes)

        if (igProfileRes.ok && igProfileBody) {
          profile = pickProfile(igProfileBody)
        } else {
          // Fallback: Instagram Basic Display (limited fields)
          const basicUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(igId)}`)
          basicUrl.searchParams.set("fields", "id,username,account_type,media_count")
          basicUrl.searchParams.set("access_token", token)
          const basicRes = await fetch(basicUrl.toString(), { method: "GET", cache: "no-store" })
          const basicBody = await safeJson(basicRes)
          if (basicRes.ok && basicBody) {
            const picked = pickProfile(basicBody)
            profile = {
              ...picked,
              // Preserve preferred username if set and API didn't provide one.
              username: picked.username ?? preferredUsername,
            }
          } else {
            profile = null
            profileError = "failed_to_fetch_profile"
          }
        }
      } catch {
        profile = null
        profileError = "failed_to_fetch_profile"
      }
    }

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
      igUserId: hasIds ? igId : null,
      pageId: hasIds ? pageId : null,
      username: hasToken ? (typeof profile?.username === "string" ? profile.username : preferredUsername) : null,
      profile,
      ...(profileError ? { profileError } : null),
    }
  } catch (err: any) {
    return {
      connected: false,
      provider: "instagram" as const,
      hasToken: false,
      hasIds: false,
      igUserId: null,
      pageId: null,
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
