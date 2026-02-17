import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const

function clampInt(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === "string" && v.trim() ? Number(v) : typeof v === "number" ? v : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function pickDigitString(obj: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v))
    if (typeof v === "string") {
      const s = v.trim()
      if (s && /^\d+$/.test(s)) return s
    }
  }
  return null
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const qRaw = String(url.searchParams.get("q") ?? "")
    const q = qRaw.trim()

    const limit = clampInt(url.searchParams.get("limit"), 24, 1, 50)
    const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1_000_000)

    if (!q) {
      return NextResponse.json({ items: [], limit, offset }, { headers: NO_STORE_HEADERS })
    }

    const supabase = createPublicClient()

    const rpcAttempts: Array<{ key: string; args: Record<string, any> }> = [
      { key: "search_query", args: { search_query: q } },
      { key: "q", args: { q } },
      { key: "query", args: { query: q } },
      { key: "p_search_query", args: { p_search_query: q } },
    ]

    let data: any = null
    let lastError: any = null
    let usedKey: string | null = null

    for (const attempt of rpcAttempts) {
      usedKey = attempt.key
      try {
        const r = await supabase.rpc("search_creator_cards_public", attempt.args)
        if ((r as any)?.error) {
          lastError = (r as any).error
          continue
        }
        data = (r as any)?.data
        lastError = null
        break
      } catch (e: unknown) {
        lastError = e
      }
    }

    if (lastError) {
      const msg =
        typeof (lastError as any)?.message === "string"
          ? String((lastError as any).message)
          : typeof (lastError as any)?.error_description === "string"
            ? String((lastError as any).error_description)
            : "rpc_failed"

      return NextResponse.json(
        {
          items: [],
          error: msg,
          detail: lastError,
          tried_keys: rpcAttempts.map((x) => x.key),
          used_key: usedKey,
          limit,
          offset,
        },
        { status: 500, headers: NO_STORE_HEADERS },
      )
    }

    const rows = Array.isArray(data) ? data : []

    // eslint-disable-next-line no-console
    console.log("[API DEBUG] matchmaking search row sample:", rows?.[0])

    const items = rows.map((r: any) => {
      const id = typeof r?.id === "string" ? r.id : ""

      const creatorNumericId =
        pickDigitString(
          r,
          "creator_numeric_id",
          "creatorNumericId",
          "creator_numericId",
          "creator_id_numeric",
          "creatorIdNumeric",
          "numeric_creator_id",
          "ig_user_id",
          "igUserId",
          "instagram_user_id",
          "instagramUserId",
          "numeric_id",
          "numericId",
          "id_numeric",
          "idNumeric"
        ) ?? null

      // eslint-disable-next-line no-console
      console.log("[API DEBUG] extracted creatorNumericId:", creatorNumericId)

      const numericId = creatorNumericId != null ? Number(creatorNumericId) : null
      const numericIdSafe = numericId != null && Number.isSafeInteger(numericId) ? numericId : null
      const igUsername = typeof r?.ig_username === "string" ? r.ig_username : null
      const handle = typeof r?.handle === "string" ? r.handle : typeof r?.ig_username === "string" ? r.ig_username : null
      const avatarUrl = typeof r?.avatar_url === "string" ? r.avatar_url : null
      const minPrice = typeof r?.min_price === "number" && Number.isFinite(r.min_price) ? r.min_price : r?.min_price === null ? null : null
      const isPublic = r?.is_public === true

      const displayName = typeof r?.display_name === "string" && r.display_name.trim() ? r.display_name.trim() : typeof igUsername === "string" && igUsername.trim() ? igUsername.trim() : handle ? String(handle) : id

      return {
        id,
        handle,
        igUsername,
        creatorNumericId: creatorNumericId ?? undefined,
        statsFetchId: creatorNumericId ?? undefined,
        numericId: numericIdSafe != null ? numericIdSafe : undefined,
        avatarUrl,
        minPrice,
        is_public: isPublic,
        profileUrl: id ? `/card/${encodeURIComponent(id)}` : "",
        isDemo: false,
        displayName,
        category: typeof r?.niche === "string" && r.niche.trim() ? r.niche.trim() : "Creator",
        followerCount: 0,
        engagementRate: null,
        isVerified: false,
      }
    })

    const publicOnly = items.filter((r: any) => r?.is_public === true)
    const sliced = publicOnly.slice(offset, offset + limit)

    return NextResponse.json({ items: sliced, total: publicOnly.length, limit, offset }, { headers: NO_STORE_HEADERS })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json(
      { items: [], error: msg, limit: 24, offset: 0 },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
