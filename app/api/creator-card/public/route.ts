import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const handle = String(url.searchParams.get("handle") || "").trim()
    if (!handle) return NextResponse.json({ ok: false, error: "missing_handle" }, { status: 400 })

    const { data, error } = await supabaseServer
      .from("creator_cards")
      .select("*, portfolio")
      .eq("handle", handle)
      .eq("is_public", true)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

    const row = asRecord(data as unknown)
    const card = row ? {
      ...row,
      featuredItems: Array.isArray(row.featured_items) ? row.featured_items : [],
    } : data

    return NextResponse.json({ ok: true, card })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
