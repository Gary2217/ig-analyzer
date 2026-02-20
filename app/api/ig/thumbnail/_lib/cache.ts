export const THUMB_TTL_MS = 60_000
export const THUMB_CACHE_MAX = 200
export const THUMB_BUCKET = "thumb-cache"
export const THUMB_TABLE = "ig_thumbnail_cache"

export type ThumbCacheEntry = { ts: number; status: number; contentType: string; body: ArrayBuffer }
export const __thumbCache = new Map<string, ThumbCacheEntry>()
