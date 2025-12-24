import { NextResponse, type NextRequest } from "next/server"
import { cookies, headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_VERSION = "v24.0"

// Must match /api/instagram/media fallback IDs (do NOT change media route behavior in this task)
const FALLBACK_PAGE_ID = "851912424681350"
const FALLBACK_IG_BUSINESS_ID = "17841404364250644"

type ErrorStage = "read_cookie" | "exchange_page_token" | "fetch_ig_profile"

type IgMeResponse = {
  username: string
  name?: string
  display_name?: string
  profile_picture_url?: string
  account_type?: string
  followers_count?: number
  follows_count?: number
  media_count?: number
  recent_media: Array<{
    id: string
    media_type?: string
    media_url?: string
    caption?: string
    timestamp?: string
  }>
}

const getFbtraceId = (meta: any): string | undefined => {
  const v = meta?.fbtrace_id ?? meta?.error?.fbtrace_id
  return typeof v === "string" && v.trim() ? v : undefined
}

const fetchJson = async (url: string) => {
  const res = await fetch(url, { method: "GET", cache: "no-store" })
  const json = (await res.json().catch(() => null)) as any
  return { res, json }
}

const jsonError = (
  status: number,
  stage: ErrorStage,
  errorMessage: string,
  extra?: {
    upstreamStatus?: number
    fbtrace_id?: string
    page_id?: string
    ig_id?: string
  },
) => NextResponse.json({ stage, errorMessage, ...(extra ?? {}) }, { status })

export async function GET(req: NextRequest) {
  const c = await cookies()
  const h = await headers()

  const cookieToken = c.get("ig_access_token")?.value ?? ""
  const auth = h.get("authorization") ?? ""
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  const token = (cookieToken || bearer || "").trim()

  if (!token) {
    return jsonError(401, "read_cookie", "missing_token")
  }

  try {
    // Single path:
    // read token -> BM discovery (optional) -> fallback ids -> exchange page token -> fetch ig profile -> success
    let discoveredPageId: string | null = null
    let discoveredIgId: string | null = null
    let discoveredPageAccessToken: string | null = null

    // (Optional) Business Manager discovery
    const businessesUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/businesses`)
    businessesUrl.searchParams.set("access_token", token)
    const bmBusinesses = await fetchJson(businessesUrl.toString())

    if (bmBusinesses.res.ok) {
      const businesses = Array.isArray(bmBusinesses.json?.data) ? bmBusinesses.json.data : []
      const businessId = businesses?.[0]?.id

      if (businessId) {
        const ownedPagesUrl = new URL(
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(String(businessId))}/owned_pages`,
        )
        ownedPagesUrl.searchParams.set("fields", "id,access_token,instagram_business_account{id}")
        ownedPagesUrl.searchParams.set("access_token", token)

        const ownedPages = await fetchJson(ownedPagesUrl.toString())
        if (ownedPages.res.ok) {
          const pages = Array.isArray(ownedPages.json?.data) ? ownedPages.json.data : []
          const pageWithIg = pages.find((p: any) => p?.instagram_business_account?.id)

          discoveredPageId = pageWithIg?.id ? String(pageWithIg.id) : null
          discoveredIgId = pageWithIg?.instagram_business_account?.id
            ? String(pageWithIg.instagram_business_account.id)
            : null
          discoveredPageAccessToken =
            typeof pageWithIg?.access_token === "string" && pageWithIg.access_token
              ? String(pageWithIg.access_token)
              : null
        }
      }
    }

    const pageId = discoveredPageId ?? FALLBACK_PAGE_ID
    const igId = discoveredIgId ?? FALLBACK_IG_BUSINESS_ID

    // Ensure page access token (if BM did not provide one)
    let pageAccessToken: string | null = discoveredPageAccessToken
    if (!pageAccessToken) {
      const pageTokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(String(pageId))}`)
      pageTokenUrl.searchParams.set("fields", "access_token")
      pageTokenUrl.searchParams.set("access_token", token)

      const pageToken = await fetchJson(pageTokenUrl.toString())
      if (!pageToken.res.ok || typeof pageToken.json?.access_token !== "string" || !pageToken.json.access_token) {
        return jsonError(pageToken.res.status || 400, "exchange_page_token", "failed_to_get_page_access_token", {
          upstreamStatus: pageToken.res.status,
          fbtrace_id: getFbtraceId(pageToken.json),
          page_id: String(pageId),
          ig_id: String(igId),
        })
      }
      pageAccessToken = String(pageToken.json.access_token)
    }

    // Fetch IG profile via Page -> instagram_business_account (stable path)
    const pageProfileUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(String(pageId))}`,
    )
    pageProfileUrl.searchParams.set(
      "fields",
      "instagram_business_account{username,name,profile_picture_url,account_type,followers_count,follows_count,media_count}",
    )
    pageProfileUrl.searchParams.set("access_token", String(pageAccessToken))

    const pageProfile = await fetchJson(pageProfileUrl.toString())
    if (!pageProfile.res.ok) {
      return jsonError(pageProfile.res.status || 400, "fetch_ig_profile", "failed_to_fetch_ig_profile", {
        upstreamStatus: pageProfile.res.status,
        fbtrace_id: getFbtraceId(pageProfile.json),
        page_id: String(pageId),
        ig_id: String(igId),
      })
    }

    const ig = pageProfile.json?.instagram_business_account
    const username = typeof ig?.username === "string" ? ig.username.trim() : ""
    if (!username) {
      return jsonError(502, "fetch_ig_profile", "ig_profile_missing_username", {
        upstreamStatus: pageProfile.res.status,
        fbtrace_id: getFbtraceId(pageProfile.json),
        page_id: String(pageId),
        ig_id: String(igId),
      })
    }

    const payload: IgMeResponse = {
      username,
      name: typeof ig?.name === "string" ? ig.name : undefined,
      profile_picture_url: typeof ig?.profile_picture_url === "string" ? ig.profile_picture_url : undefined,
      account_type: typeof ig?.account_type === "string" ? ig.account_type : undefined,
      followers_count: typeof ig?.followers_count === "number" ? ig.followers_count : undefined,
      follows_count: typeof ig?.follows_count === "number" ? ig.follows_count : undefined,
      media_count: typeof ig?.media_count === "number" ? ig.media_count : undefined,
      recent_media: [],
    }

    return NextResponse.json(payload)
  } catch (e: any) {
    return jsonError(500, "fetch_ig_profile", "server_error", {
      upstreamStatus: 500,
      page_id: FALLBACK_PAGE_ID,
      ig_id: FALLBACK_IG_BUSINESS_ID,
    })
  }
}
