export interface CreatorCard {
  id: string
  displayName: string
  avatarUrl: string
  category: string
  deliverables?: string[]
  followerCount: number
  avgLikes?: number | null
  avgComments?: number | null
  engagementRate: number | null
  isVerified: boolean
  profileUrl: string
  isDemo?: boolean
}
