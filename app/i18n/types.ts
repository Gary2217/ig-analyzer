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

    formatReels: string
    formatPosts: string
    formatStories: string
    formatOther: string

    advancedFilters: string
    typeShortVideo: string
    typeLongVideo: string
    typeUGC: string
    typeLive: string
    typeReviewUnboxing: string
    typeEvent: string
    typeOther: string

    budgetLabel: string
    budgetOtherAmount: string
    budgetCustomPlaceholder: string
    budgetClearCustom: string

    budgetRange0_5000: string
    budgetRange5000_10000: string
    budgetRange10000_30000: string
    budgetRange30000_60000: string
    budgetRange60000_plus: string

    sortFollowersDesc: string
    sortErDesc: string

    sortRecommended: string
    sortNewest: string
    sortName: string
    sortFollowers: string
    sortEngagement: string

    myCardBadge: string
    myCardFirstToggle: string

    filtersButton: string
    profileNotSet: string
    favoriteAddAria: string
    favoriteRemoveAria: string

    showMoreChips: (n: number) => string
    showLessChips: string

    noTopics: string
    viewDetails: string

    favoritesTitle: string
    close: string
    clearAll: string
    favoritesCount: (n: number) => string
    emptyFavorites: string

    minPriceFrom: (amount: string) => string

    followersLabel: string
    engagementLabel: string
  }
}
