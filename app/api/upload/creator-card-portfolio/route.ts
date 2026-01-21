import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const c = await cookies()

  const token = (c.get("ig_access_token")?.value ?? "").trim()
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_access_token" },
      { status: 401 }
    )
  }

  const igUserId =
    (c.get("ig_ig_id")?.value ?? "").trim() ||
    (c.get("ig_id")?.value ?? "").trim() ||
    (c.get("ig_user_id")?.value ?? "").trim() ||
    (c.get("igUserId")?.value ?? "").trim() ||
    ""

  if (!igUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_user_id_cookie",
        keysTried: ["ig_ig_id", "ig_id", "ig_user_id", "igUserId"],
      },
      { status: 401 }
    )
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
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}` 
  const storagePath = `creator-card/portfolio/${igUserId}/${filename}` 

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseServer.storage
    .from("public")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    return NextResponse.json(
      { ok: false, error: "upload_failed" },
      { status: 500 }
    )
  }

  const { data } = supabaseServer.storage
    .from("public")
    .getPublicUrl(storagePath)

  return NextResponse.json({
    ok: true,
    url: data.publicUrl,
    path: storagePath,
  })
}
