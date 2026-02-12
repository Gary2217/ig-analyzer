import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clampInt(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === "string" && v.trim() ? Number(v) : typeof v === "number" ? v : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const qRaw = String(url.searchParams.get("q") ?? "")
    const q = qRaw.trim()

    const limit = clampInt(url.searchParams.get("limit"), 24, 1, 50)
    const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1_000_000)

    if (!q) {
      return NextResponse.json({ items: [], limit, offset })
    }

    const supabase = createPublicClient()

    const { data, error } = await supabase.rpc("search_creator_cards_public", {
      search_query: q,
    })

    if (error) {
      return NextResponse.json(
        { items: [], error: error.message, limit, offset },
        { status: 500 },
      )
    }

    const rows = Array.isArray(data) ? data : []
    const publicOnly = rows.filter((r: any) => (r as any)?.is_public === true)

    const sliced = publicOnly.slice(offset, offset + limit)

    return NextResponse.json({ items: sliced, total: publicOnly.length, limit, offset })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json(
      { items: [], error: msg, limit: 24, offset: 0 },
      { status: 500 },
    )
  }
}
