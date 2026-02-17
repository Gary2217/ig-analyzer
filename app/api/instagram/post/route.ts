import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient } from "@/lib/supabase/server"
import { readIgPostAnalysisCache, upsertIgPostAnalysisCache } from "@/lib/server/igCache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH_VERSION = "v21.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

const DB_STALE_MS = 10 * 60 * 1000 // 10 minutes

type CookieStore = Awaited<ReturnType<typeof cookies>>

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function parseInstagramShortcode(rawUrl: string): { shortcode: string; type: "p" | "reel" | "tv" } | null {
  const s0 = (rawUrl || "").trim()
  if (!s0) return null

  let u: URL
  try {
    u = new URL(s0)
  } catch {
    try {
      u = new URL(`https://${s0.replace(/^\/+/, "")}`)
    } catch {
      return null
    }
  }

  const host = u.hostname.toLowerCase()
  if (host.includes("threads.net")) return null
  if (!(host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am")) return null

  const path = u.pathname || ""
  const m = path.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/)
  if (!m) return null

  const type = m[1] === "reels" ? "reel" : (m[1] as any)
  const shortcode = m[2]
  if (!shortcode) return null

  return { shortcode, type }
}

function mapError(status: number): { status: number; body: { ok: false; code: string } } {
  if (status === 401) return { status: 401, body: { ok: false, code: "UNAUTHORIZED" } }
  if (status === 403) return { status: 403, body: { ok: false, code: "FORBIDDEN" } }
  if (status === 400) return { status: 400, body: { ok: false, code: "BAD_URL" } }
  return { status: 500, body: { ok: false, code: "UNKNOWN" } }
}

async function graphGetJson(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  const body = await safeJson(res)
  return { res, body }
}

async function getPageTokenFromCookie(token: string, page_id: string) {
  const pageTokenUrl = `${GRAPH_BASE}/${encodeURIComponent(page_id)}?fields=access_token&access_token=${encodeURIComponent(token)}`
  const { res, body } = await graphGetJson(pageTokenUrl)
  if (!res.ok || !body?.access_token) {
    return { ok: false as const, status: res.status || 400, body }
  }
  return { ok: true as const, pageToken: body.access_token as string }
}

async function loadIdsIfMissing(token: string, c: CookieStore) {
  let page_id = c.get("ig_page_id")?.value || ""
  let ig_id = c.get("ig_ig_id")?.value || ""

  if (page_id && ig_id) return { ok: true as const, page_id, ig_id }

  const accountsUrl = `${GRAPH_BASE}/me/accounts?fields=name,instagram_business_account&access_token=${encodeURIComponent(token)}`
  const { res: accountsRes, body: accountsBody } = await graphGetJson(accountsUrl)
  if (!accountsRes.ok) return { ok: false as const, status: accountsRes.status || 400, body: accountsBody }

  const accounts = Array.isArray(accountsBody?.data) ? accountsBody.data : []
  const candidates = accounts.filter((p: any) => p?.instagram_business_account?.id)
  const picked = candidates[0]

  if (!picked?.id || !picked?.instagram_business_account?.id) {
    return { ok: false as const, status: 403, body: { error: "no_instagram_business_account" } }
  }

  page_id = String(picked.id)
  ig_id = String(picked.instagram_business_account.id)

  c.set("ig_page_id", page_id, { httpOnly: true, sameSite: "lax", path: "/" })
  c.set("ig_ig_id", ig_id, { httpOnly: true, sameSite: "lax", path: "/" })

  return { ok: true as const, page_id, ig_id }
}

async function findMediaIdByShortcode(params: {
  ig_id: string
  pageToken: string
  shortcode: string
  maxPages?: number
  pageLimit?: number
}) {
  const maxPages = typeof params.maxPages === "number" ? params.maxPages : 6
  const pageLimit = typeof params.pageLimit === "number" ? params.pageLimit : 50

  let after = ""
  for (let i = 0; i < maxPages; i++) {
    const fields = [
      "id",
      "shortcode",
      "permalink",
      "media_type",
      "media_url",
      "thumbnail_url",
      "caption",
      "timestamp",
      "like_count",
      "comments_count",
    ].join(",")

    const mediaUrl =
      `${GRAPH_BASE}/${encodeURIComponent(params.ig_id)}/media` +
      `?fields=${encodeURIComponent(fields)}` +
      `&limit=${encodeURIComponent(String(pageLimit))}` +
      (after ? `&after=${encodeURIComponent(after)}` : "") +
      `&access_token=${encodeURIComponent(params.pageToken)}`

    const { res, body } = await graphGetJson(mediaUrl)

    if (!res.ok) {
      return { ok: false as const, status: res.status || 400, body }
    }

    const list = Array.isArray(body?.data) ? body.data : []
    const hit = list.find((m: any) => String(m?.shortcode || "").trim() === params.shortcode)
    if (hit?.id) {
      return { ok: true as const, media: hit }
    }

    const nextAfter = body?.paging?.cursors?.after
    if (typeof nextAfter === "string" && nextAfter) {
      after = nextAfter
      continue
    }

    return { ok: false as const, status: 404, body: { error: "media_not_found" } }
  }

  return { ok: false as const, status: 404, body: { error: "media_not_found" } }
}

async function fetchInsights(mediaId: string, pageToken: string, mediaType: string) {
  const upper = String(mediaType || "").toUpperCase()
  const metricSet: string[] = ["impressions", "reach", "saved", "shares"]
  if (upper === "VIDEO" || upper.includes("REEL")) {
    metricSet.push("plays")
    metricSet.push("video_views")
    metricSet.push("total_video_views")
  }

  const insightsUrl =
    `${GRAPH_BASE}/${encodeURIComponent(mediaId)}/insights` +
    `?metric=${encodeURIComponent(metricSet.join(","))}` +
    `&access_token=${encodeURIComponent(pageToken)}`

  const { res, body } = await graphGetJson(insightsUrl)
  if (!res.ok) return { ok: false as const, status: res.status || 400, body }

  const data = Array.isArray(body?.data) ? body.data : []
  const out: Record<string, number | null> = {}

  for (const item of data) {
    const name = String(item?.name || "").trim()
    const value = item?.values?.[0]?.value
    if (!name) continue
    out[name] = typeof value === "number" && Number.isFinite(value) ? value : null
  }

  const playsFallback = (() => {
    const primary = out["plays"]
    if (primary !== undefined && primary !== null) return primary
    const v1 = out["video_views"]
    if (v1 !== undefined && v1 !== null) return v1
    const v2 = out["total_video_views"]
    if (v2 !== undefined && v2 !== null) return v2
    return null
  })()

  return { ok: true as const, insights: { ...out, plays: playsFallback } }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const raw = url.searchParams.get("url") || ""

    const normalizedPermalink = (raw || "").trim()

    let authedUserId: string | null = null
    let authedClient: any = null
    try {
      const authed = await createAuthedClient()
      authedClient = authed
      const userRes = await authed.auth.getUser()
      const user = userRes?.data?.user ?? null
      authedUserId = user?.id ? String(user.id) : null
    } catch {
      authedUserId = null
      authedClient = null
    }

    const parsed = parseInstagramShortcode(raw)
    if (!parsed) {
      const e = mapError(400)
      return NextResponse.json(e.body, { status: e.status })
    }

    if (authedUserId && authedClient && normalizedPermalink) {
      const db = await readIgPostAnalysisCache({
        authed: authedClient,
        userId: authedUserId,
        normalizedPermalink,
        staleMs: DB_STALE_MS,
      })
      if (db.ok && db.isFresh) {
        const row = db.row as any
        const cachedMedia = row?.raw?.media
        const cachedInsights = row?.raw?.insights
        if (cachedMedia && typeof cachedMedia === "object") {
          const m: any = cachedMedia
          const ins: any = cachedInsights && typeof cachedInsights === "object" ? cachedInsights : {}
          return NextResponse.json(
            {
              ok: true,
              media: {
                id: String(m?.id || ""),
                shortcode: parsed.shortcode,
                media_type: m?.media_type ?? null,
                media_url: m?.media_url ?? null,
                thumbnail_url: m?.thumbnail_url ?? null,
                caption: m?.caption ?? null,
                timestamp: m?.timestamp ?? null,
              },
              counts: {
                like_count: typeof m?.like_count === "number" ? m.like_count : null,
                comments_count: typeof m?.comments_count === "number" ? m.comments_count : null,
              },
              insights: {
                impressions: typeof ins?.impressions === "number" ? ins.impressions : null,
                reach: typeof ins?.reach === "number" ? ins.reach : null,
                plays: typeof ins?.plays === "number" ? ins.plays : null,
                saved: typeof ins?.saved === "number" ? ins.saved : null,
                shares: typeof ins?.shares === "number" ? ins.shares : null,
              },
            },
            { status: 200 },
          )
        }
      }
    }

    const c = await cookies()
    const token = c.get("ig_access_token")?.value
    if (!token) {
      const e = mapError(401)
      return NextResponse.json(e.body, { status: e.status })
    }

    const ids = await loadIdsIfMissing(token, c)
    if (!ids.ok) {
      const mapped = ids.status === 401 || ids.status === 403 ? mapError(ids.status) : mapError(500)
      return NextResponse.json(mapped.body, { status: mapped.status })
    }

    const pageTokenRes = await getPageTokenFromCookie(token, ids.page_id)
    if (!pageTokenRes.ok) {
      const mapped = pageTokenRes.status === 401 || pageTokenRes.status === 403 ? mapError(pageTokenRes.status) : mapError(500)
      return NextResponse.json(mapped.body, { status: mapped.status })
    }

    const mediaHit = await findMediaIdByShortcode({
      ig_id: ids.ig_id,
      pageToken: pageTokenRes.pageToken,
      shortcode: parsed.shortcode,
    })

    if (!mediaHit.ok) {
      if (mediaHit.status === 401 || mediaHit.status === 403) {
        const mapped = mapError(mediaHit.status)
        return NextResponse.json(mapped.body, { status: mapped.status })
      }
      const mapped = mapError(500)
      return NextResponse.json(mapped.body, { status: mapped.status })
    }

    const media = mediaHit.media

    const insightsRes = await fetchInsights(String(media?.id || ""), pageTokenRes.pageToken, String(media?.media_type || ""))
    const insights: Record<string, number | null> = insightsRes.ok ? insightsRes.insights : {}

    if (authedUserId && authedClient && normalizedPermalink) {
      try {
        const like_count = typeof media?.like_count === "number" ? media.like_count : Number(media?.like_count ?? 0) || 0
        const comments_count = typeof media?.comments_count === "number" ? media.comments_count : Number(media?.comments_count ?? 0) || 0
        const engagement = like_count + comments_count

        await upsertIgPostAnalysisCache({
          authed: authedClient,
          row: {
            user_id: authedUserId,
            ig_user_id: ids.ig_id,
            normalized_permalink: normalizedPermalink,
            original_permalink: normalizedPermalink,
            media_id: typeof media?.id === "string" ? media.id : String(media?.id || "") || null,
            media_type: media?.media_type ?? null,
            taken_at: typeof media?.timestamp === "string" ? media.timestamp : null,
            like_count,
            comments_count,
            insights: {
              impressions: insights["impressions"] ?? null,
              reach: insights["reach"] ?? null,
              plays: insights["plays"] ?? null,
              saved: insights["saved"] ?? null,
              shares: insights["shares"] ?? null,
            },
            computed: { engagement },
            raw: {
              media: media ?? null,
              insights: insights ?? null,
            },
            analyzed_at: new Date().toISOString(),
          },
        })
      } catch {
        // swallow
      }
    }

    return NextResponse.json(
      {
        ok: true,
        media: {
          id: String(media?.id || ""),
          shortcode: parsed.shortcode,
          media_type: media?.media_type ?? null,
          media_url: media?.media_url ?? null,
          thumbnail_url: media?.thumbnail_url ?? null,
          caption: media?.caption ?? null,
          timestamp: media?.timestamp ?? null,
        },
        counts: {
          like_count: typeof media?.like_count === "number" ? media.like_count : null,
          comments_count: typeof media?.comments_count === "number" ? media.comments_count : null,
        },
        insights: {
          impressions: insights["impressions"] ?? null,
          reach: insights["reach"] ?? null,
          plays: insights["plays"] ?? null,
          saved: insights["saved"] ?? null,
          shares: insights["shares"] ?? null,
        },
      },
      { status: 200 },
    )
  } catch {
    const e = mapError(500)
    return NextResponse.json(e.body, { status: e.status })
  }
}
