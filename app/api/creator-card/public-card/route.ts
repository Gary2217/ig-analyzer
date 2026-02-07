import { NextResponse, type NextRequest } from "next/server"
import { fetchPublicCreatorCardById } from "@/app/lib/server/publicCreatorCard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getRequestId(req: NextRequest) {
  const existing = req.headers.get("x-request-id")
  if (existing && existing.trim()) return existing.trim()
  return crypto.randomUUID()
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  const requestId = getRequestId(req)

  try {
    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim()
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "missing_id" },
        {
          status: 400,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
            "Server-Timing": `public_card;dur=${Date.now() - start}`,
          },
        },
      )
    }

    const { ok, etag, card, error } = await fetchPublicCreatorCardById(id)

    const inm = req.headers.get("if-none-match")
    if (inm && inm === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600")
      h.set("Server-Timing", `public_card;dur=${Date.now() - start}`)
      return new NextResponse(null, { status: 304, headers: h })
    }

    const status = ok ? 200 : error === "not_found" ? 404 : error === "env_missing" ? 503 : 500

    return NextResponse.json(
      ok ? { ok: true, card } : { ok: false, error: error ?? "service_error" },
      {
        status,
        headers: {
          "x-request-id": requestId,
          "ETag": etag,
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
          "Server-Timing": `public_card;dur=${Date.now() - start}`,
        },
      },
    )
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    return NextResponse.json(
      { ok: false, error: "service_error" },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          "Server-Timing": `public_card;dur=${Date.now() - start}`,
          "X-Error": msg.slice(0, 120),
        },
      },
    )
  }
}
