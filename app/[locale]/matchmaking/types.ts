export interface CreatorCard {
  id: string
  displayName: string
  avatarUrl: string
  category: string
  deliverables?: string[]
  minPrice?: number | null
  followerCount: number
  avgLikes?: number | null
  avgComments?: number | null
  engagementRate: number | null
  stats?: {
    creatorId?: string
    followers?: number | null
    engagementRatePct?: number | null
  }
  isVerified: boolean
  profileUrl: string
  isDemo?: boolean
}
