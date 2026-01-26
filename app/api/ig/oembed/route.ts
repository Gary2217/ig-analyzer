import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

type OEmbedSuccessResponse = {
  ok: true
  data: {
    thumbnail_url: string
    thumbnail_width: number
    thumbnail_height: number
    author_name: string
    provider_name: string
  }
}

type OEmbedErrorResponse = {
  ok: false
  error: {
    status: number
    message: string
  }
}

type OEmbedResponse = OEmbedSuccessResponse | OEmbedErrorResponse

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  // Validate URL parameter
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: 400,
          message: "Missing 'url' query parameter",
        },
      } as OEmbedErrorResponse,
      { status: 400 }
    )
  }

  // Validate Instagram URL format
  const instagramUrlPattern = /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?(\?.*)?$/
  if (!instagramUrlPattern.test(url)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: 400,
          message: "Invalid Instagram URL format. Must be a post, reel, or TV URL.",
        },
      } as OEmbedErrorResponse,
      { status: 400 }
    )
  }

  try {
    // Fetch from Instagram oEmbed API server-side with timeout
    const oembedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
    
    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InstagramOEmbedBot/1.0)",
      },
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(`Instagram oEmbed API error: ${response.status} - ${errorText}`)
      
      // Determine user-friendly message based on status
      let userMessage = "The post may be private or unavailable."
      if (response.status === 401 || response.status === 403) {
        userMessage = "This post is private or restricted."
      } else if (response.status === 429) {
        userMessage = "Rate limit exceeded. Please try again later."
      } else if (response.status === 404) {
        userMessage = "Post not found. It may have been deleted."
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: {
            status: response.status,
            message: userMessage,
          },
        } as OEmbedErrorResponse,
        { 
          status: 502,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      )
    }

    const data = await response.json()

    // Validate response data
    if (!data.thumbnail_url) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            status: 500,
            message: "Instagram API response missing thumbnail_url",
          },
        } as OEmbedErrorResponse,
        { status: 500 }
      )
    }

    // Return normalized response
    const successResponse: OEmbedSuccessResponse = {
      ok: true,
      data: {
        thumbnail_url: data.thumbnail_url,
        thumbnail_width: data.thumbnail_width || 640,
        thumbnail_height: data.thumbnail_height || 640,
        author_name: data.author_name || "",
        provider_name: data.provider_name || "Instagram",
      },
    }

    return NextResponse.json(successResponse, {
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
      },
    })
  } catch (error) {
    console.error("Failed to fetch Instagram oEmbed:", error)
    
    // Handle timeout/abort errors
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"))
    const userMessage = isTimeout 
      ? "Request timed out. The post may be slow to load."
      : error instanceof Error ? error.message : "Failed to fetch Instagram data"
    
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: isTimeout ? 504 : 500,
          message: userMessage,
        },
      } as OEmbedErrorResponse,
      { 
        status: isTimeout ? 504 : 500,
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      }
    )
  }
}
