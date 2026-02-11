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
  | "other"

export type TypeKey = CollabType | FormatKey

export type BudgetRange =
  | "any"
  | "custom"
  | "1000"
  | "3000"
  | "1000_5000"
  | "5000_10000"
  | "10000_30000"
  | "30000_60000"
  | "60000_100000"
  | "100000_plus"

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
  tagCategories?: string[]
  platforms?: Platform[]
  dealTypes?: string[]
  collabTypes?: CollabType[]
  deliverables?: string[]
  budgetMin?: number
  budgetMax?: number
  minPrice?: number | null
  stats?: CreatorStats
  contact?: string | null
  contactEmail?: string
  contactPhone?: string
  contactLine?: string
  primaryContactMethod?: "email" | "phone" | "line"
  href?: string
  isDemo?: boolean
}
