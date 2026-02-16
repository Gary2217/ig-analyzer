export type CopyDictionary = {
  common: {
    save: string
    saved: string
    favorites: string
    all: string
    searchPlaceholder: string
    clear: string
    add: string
  }
  matchmaking: {
    title: string
    description: string
    pageTitle: string
    pageSubtitleLine1: string
    pageSubtitleLine2: string
    pageHeadline: string
    pageSubheadline: string
    loadingHelper: string
    emptyResultsTitle: string
    emptyResultsHint: string
    bestMatchHelper: string
    ctaStartCollaboration: string
    badgeWorkedWithBrands: string
    badgeProfileComplete: string
    labelFollowers: string
    labelEngagement: string
    withinBudgetLabel: string
    myCardFirstToggle: string
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

    sortBestMatch: string
    sortFollowersDesc: string
    sortErDesc: string

    sortRecommended: string
    sortNewest: string
    sortName: string
    sortFollowers: string
    sortEngagement: string

    myCardBadge: string
    demoSectionTitle: string
    demoBadge: string

    filtersButton: string
    profileNotSet: string
    favoriteAddAria: string
    favoriteRemoveAria: string

    showMoreChips: (n: number) => string
    showLessChips: string

    creatorTypeLabel: string

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

    recommendedLabel: string
    popularBadge: string
    highEngagementLabel: string

    searchingHelper: string
    resultsCountLabel: (n: number) => string
    clearSearchCta: string
    remoteErrorHint: string

    updatingStats: string
    retryStatsAria: string

    paginationPrev: string
    paginationNext: string
    paginationPage: (page: number, total: number) => string

    platformFilterLabel: string
    otherLabel: string
    customCreatorTypePlaceholder: string
    clearSearchAria: string

    demoEditModeLabel: string
    turnOffLabel: string

    editCardCta: string

    uploadImageCta: string
    resetCta: string

    pageErrorTitle: string
    pageErrorBody: string
    pageErrorRetry: string
  }
}
