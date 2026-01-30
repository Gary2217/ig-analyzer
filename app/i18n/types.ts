export type CopyDictionary = {
  common: {
    save: string
    saved: string
    favorites: string
    all: string
    searchPlaceholder: string
  }
  matchmaking: {
    title: string
    description: string
    totalCreators: (n: number) => string

    allPlatforms: string
    anyBudget: string
    allTypes: string
    allCategories: string

    platformInstagram: string
    platformTikTok: string
    platformYouTube: string
    platformFacebook: string

    sortRecommended: string
    sortNewest: string
    sortName: string
    sortFollowers: string
    sortEngagement: string

    noTopics: string
    viewDetails: string

    favoritesTitle: string
    close: string
    clearAll: string
    favoritesCount: (n: number) => string
    emptyFavorites: string

    followersLabel: string
    engagementLabel: string
  }
}
