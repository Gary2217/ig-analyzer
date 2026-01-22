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

const BUCKET = "creator-card"

export async function POST(req: Request) {
  const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "local"

  console.log(
    "[upload] url host:",
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host
  )
  console.log(
    "[upload] has service key:",
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  )

  const c = await cookies()
  const token = (c.get("ig_access_token")?.value ?? "").trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthenticated", build: BUILD }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file")

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing_file", build: BUILD },
      { status: 400 }
    )
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "file_must_be_image", build: BUILD },
      { status: 400 }
    )
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "file_too_large_max_5mb", build: BUILD },
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

  console.log("[upload] using bucket:", BUCKET)
  const { error } = await supabaseService.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (error) {
    console.error("[upload_failed]", error)
    return NextResponse.json(
      { ok: false, error: "upload_failed", detail: error.message, build: BUILD },
      { status: 500 }
    )
  }

  const { data } = supabaseService.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  const response = NextResponse.json({ ok: true, url: data.publicUrl, path: storagePath, build: BUILD })
  response.headers.set("x-build", BUILD)
  return response
}
