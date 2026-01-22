/**
 * Shared helper to extract engagement (likes + comments) from post objects
 * with defensive field access for various API response shapes.
 */

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object")

/**
 * Extract engagement (likes + comments) from a post object.
 * Returns null only if both likes and comments are completely missing.
 * 
 * @param post - Post object from API (unknown shape)
 * @returns number (>= 0) or null if no data available
 */
export function getEngagement(post: unknown): number | null {
  if (!isRecord(post)) return null

  // Try to extract likes from various possible field names
  const likesRaw =
    post.like_count ??
    post.likeCount ??
    post.likes ??
    post.likes_count ??
    post.likesCount

  // Try to extract comments from various possible field names
  const commentsRaw =
    post.comments_count ??
    post.commentsCount ??
    post.comments ??
    post.comment_count ??
    post.commentCount

  const likes = toNum(likesRaw)
  const comments = toNum(commentsRaw)

  // If both are null, return null (no data)
  if (likes === null && comments === null) return null

  // Otherwise sum what we have (treating null as 0)
  return (likes ?? 0) + (comments ?? 0)
}

/**
 * Extract individual metrics from a post object.
 * 
 * @param post - Post object from API (unknown shape)
 * @returns Object with likes, comments, and engagement (each can be null)
 */
export function getPostMetrics(post: unknown): {
  likes: number | null
  comments: number | null
  engagement: number | null
} {
  if (!isRecord(post)) {
    return { likes: null, comments: null, engagement: null }
  }

  const likesRaw =
    post.like_count ??
    post.likeCount ??
    post.likes ??
    post.likes_count ??
    post.likesCount

  const commentsRaw =
    post.comments_count ??
    post.commentsCount ??
    post.comments ??
    post.comment_count ??
    post.commentCount

  const likes = toNum(likesRaw)
  const comments = toNum(commentsRaw)
  const engagement = getEngagement(post)

  return { likes, comments, engagement }
}
