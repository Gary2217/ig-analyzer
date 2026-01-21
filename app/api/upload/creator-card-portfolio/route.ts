export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export async function POST(req: Request) {
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
  const storagePath = `creator-card/portfolio/${filename}` 

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
