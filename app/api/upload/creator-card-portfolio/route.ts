import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

async function getIGUserId(req: Request): Promise<string | null> {
  const c = await cookies()
  const token = (c.get("ig_access_token")?.value ?? "").trim()
  if (!token) return null
  
  const cookieIgId = (c.get("ig_ig_id")?.value ?? "").trim()
  return cookieIgId || null
}

export async function POST(req: Request) {
  try {
    const igUserId = await getIGUserId(req)
    if (!igUserId) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", message: "missing_session" },
        { status: 401 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "missing_file" },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "file_must_be_image" },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "file_too_large_max_5mb" },
        { status: 400 }
      )
    }

    // Generate unique filename
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 15)
    const ext = file.name.split(".").pop() || "jpg"
    const filename = `${timestamp}-${random}.${ext}`
    const storagePath = `creator-card/portfolio/${igUserId}/${filename}`

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data, error } = await supabaseServer.storage
      .from("public")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error("[upload/creator-card-portfolio] storage error", {
        message: error.message,
        path: storagePath,
      })
      return NextResponse.json(
        { ok: false, error: "upload_failed", message: error.message },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: publicUrlData } = supabaseServer.storage
      .from("public")
      .getPublicUrl(storagePath)

    const publicUrl = publicUrlData.publicUrl

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      path: storagePath,
    })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    console.error("[upload/creator-card-portfolio] unexpected error", { message: msg })
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg.slice(0, 400) },
      { status: 500 }
    )
  }
}
