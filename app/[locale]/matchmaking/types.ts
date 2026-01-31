export interface CreatorCard {
  id: string
  igUserId?: string | null
  displayName: string
  avatarUrl: string
  category: string
  deliverables?: string[]
  minPrice?: number | null
  contact?: string | null
  followerCount: number
  avgLikes?: number | null
  avgComments?: number | null
  engagementRate: number | null
  stats?: {
    followers?: number | null
    engagementRatePct?: number | null
  }
  isVerified: boolean
  profileUrl: string
  isDemo?: boolean
}
