import { NextRequest, NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface CreatorProfileResponse {
  contact?: {
    email?: string
    instagram?: string
    website?: string
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    if (!slug) {
      return NextResponse.json(
        { error: "Creator slug is required" },
        { status: 400 }
      )
    }

    // Using public client (contact info is public read)
    // TODO: If this endpoint becomes auth-gated, switch to:
    //   const supabase = await createAuthedClient()
    // and enforce session validation before querying
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_profiles")
      .select("contact_email, contact_instagram, contact_website")
      .eq("creator_slug", slug)
      .single()

    if (error) {
      // If no row found, return empty contact
      if (error.code === "PGRST116") {
        return NextResponse.json({ contact: {} }, { status: 200 })
      }
      console.error("Error fetching creator profile:", error)
      return NextResponse.json(
        { error: "Failed to fetch creator profile" },
        { status: 500 }
      )
    }

    // Build contact object with only non-null fields
    const contact: CreatorProfileResponse["contact"] = {}
    if (data.contact_email) contact.email = data.contact_email
    if (data.contact_instagram) contact.instagram = data.contact_instagram
    if (data.contact_website) contact.website = data.contact_website

    return NextResponse.json({ contact }, { status: 200 })
  } catch (error) {
    console.error("Unexpected error in creator profile API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
