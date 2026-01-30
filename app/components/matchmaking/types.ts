export type Platform = "instagram" | "tiktok" | "youtube" | "facebook"

export type CollabType =
  | "short_video"
  | "long_video"
  | "live"
  | "ugc"
  | "review_unboxing"
  | "event"
  | "other"

export type FormatKey =
  | "reels"
  | "posts"
  | "stories"
  | "ugc"
  | "live"
  | "youtube"
  | "tiktok"
  | "facebook"
  | "review_unboxing"
  | "event"
  | "other"

export type BudgetRange =
  | "any"
  | "0_5000"
  | "5000_10000"
  | "10000_30000"
  | "30000_60000"
  | "60000_plus"

export type CreatorStats = {
  followers?: number
  engagementRate?: number
  avgViews?: number
}

export type CreatorCardData = {
  id: string
  name: string
  handle?: string
  avatarUrl?: string
  topics?: string[]
  platforms?: Platform[]
  collabTypes?: CollabType[]
  deliverables?: string[]
  budgetMin?: number
  budgetMax?: number
  stats?: CreatorStats
  href: string
}
