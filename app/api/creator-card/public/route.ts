import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const handle = String(url.searchParams.get("handle") || "").trim()
    if (!handle) return NextResponse.json({ ok: false, error: "missing_handle" }, { status: 400 })

    const { data, error } = await supabaseServer
      .from("creator_cards")
      .select("*")
      .eq("handle", handle)
      .eq("is_public", true)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

    return NextResponse.json({ ok: true, card: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 })
  }
}
