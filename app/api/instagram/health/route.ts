import { NextResponse } from "next/server"
import { graphGet } from "@/lib/instagram/graph"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const igUserId = (process.env.IG_USER_ID ?? "").trim()
  const token = (process.env.IG_ACCESS_TOKEN ?? "").trim()

  if (!igUserId || !token) {
    return NextResponse.json(
      { ok: false, error: "missing_env", missing: [!igUserId ? "IG_USER_ID" : null, !token ? "IG_ACCESS_TOKEN" : null].filter(Boolean) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const data = await graphGet<{ id?: string; username?: string }>(`/${igUserId}`, { fields: "id,username" })
    return NextResponse.json(
      { ok: true, id: typeof data?.id === "string" ? data.id : null, username: typeof data?.username === "string" ? data.username : null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "graph_error",
        status: typeof e?.status === "number" ? e.status : 500,
        message: typeof e?.message === "string" ? e.message : "unknown_error",
        code: typeof e?.code === "number" ? e.code : null,
        fbtrace_id: typeof e?.fbtrace_id === "string" ? e.fbtrace_id : null,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
