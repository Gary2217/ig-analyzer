export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

// Service Role client (REQUIRED for Storage write)
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: Request) {
  const c = await cookies()
  const token = (c.get("ig_access_token")?.value ?? "").trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file")

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing_file" },
      { status: 400 }
    )
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "file_must_be_image" },
      { status: 400 }
    )
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "file_too_large_max_5mb" },
      { status: 400 }
    )
  }

  const ext = file.name.split(".").pop() || "jpg"
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}` 
  const igUserId =
    (c.get("ig_ig_id")?.value ?? "").trim() ||
    (c.get("ig_id")?.value ?? "").trim() ||
    (c.get("ig_user_id")?.value ?? "").trim() ||
    (c.get("igUserId")?.value ?? "").trim() ||
    "unknown"
  const storagePath = `creator-card/portfolio/${igUserId}/${filename}` 

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseService.storage
    .from("public")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (error) {
    console.error("[upload_failed]", error)
    return NextResponse.json(
      { ok: false, error: "upload_failed", detail: error.message },
      { status: 500 }
    )
  }

  const { data } = supabaseService.storage
    .from("public")
    .getPublicUrl(storagePath)

  return NextResponse.json({ ok: true, url: data.publicUrl, path: storagePath })
}
