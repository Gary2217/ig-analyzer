export type OEmbedError = {
  ok: false
  error?: { status?: number; message?: string } | any
  [k: string]: any
}

export type OEmbedSuccess = {
  ok: true
  thumbnailUrl?: string
  mediaType?: string
  title?: string
  source?: "oembed" | "og"
  html?: string
  authorName?: string
  providerName?: string
  mediaId?: string
  data?: {
    thumbnail_url?: string
    thumbnail_width?: number
    thumbnail_height?: number
    title?: string
    author_name?: string
    provider_name?: string
    type?: string
    html?: string
    media_id?: string
  }
  [k: string]: any
}

export type OEmbedResponse = OEmbedSuccess | OEmbedError

export type OEmbedState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: OEmbedResponse }
  | { status: "error"; errorMessage?: string; httpStatus?: number }
  | { status: "rate_limited"; retryAtMs: number; errorMessage?: string }
