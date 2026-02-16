import type { CopyDictionary } from "./types"

export const en: CopyDictionary = {
  common: {
    save: "Save",
    saved: "Saved",
    favorites: "Shortlist",
    all: "All",
    searchPlaceholder: "Search name / handle / keyword...",
    clear: "Clear",
    add: "Add",
  },
  settingsIgAccountsTitle: "My Instagram Accounts",
  settingsIgAccountsEmpty: "No Instagram accounts connected yet.",
  settingsIgAccountsUnauthorized: "Please log in first.",
  settingsIgAccountsDisabled: "Instagram accounts feature not enabled yet.",
  settingsIgAccountsConnected: "Connected",
  settingsIgAccountsExpired: "Token expired",
  settingsIgAccountsNoToken: "No token",
  igHeaderNotLinked: "Not linked",
  igHeaderLinkedPrefix: "IG:",
  igHeaderMultipleSuffix: "+{n}",
  igHeaderPendingBadge: "Pending",
  igHeaderLoading: "Loading",
  igSelectorTitle: "Switch Instagram account",
  igSelectorEmpty: "No Instagram accounts linked",
  igSelectorLoading: "Loading…",
  igSelectorActive: "Active",
  igSelectorClose: "Close",
  matchmaking: {
    title: "Matchmaking",
    description: "Filter creators by platform, budget, and collaboration type.",
    pageTitle: "Creator Cards",
    pageSubtitleLine1: "Find creators that fit your budget and convert",
    pageSubtitleLine2: "Compare by engagement and price, then start a collaboration in one click.",
    pageHeadline: "Find creators that fit your budget and convert",
    pageSubheadline: "Compare by engagement and price, then start a collaboration in one click.",
    loadingHelper: "Finding the best creators for you…",
    emptyResultsTitle: "No creators match your filters",
    emptyResultsHint: "Try broadening platform, budget, or creator type filters, or clear some conditions.",
    bestMatchHelper: "Best Match combines engagement, audience size, and your selected budget.",
    ctaStartCollaboration: "Start Collaboration",
    badgeWorkedWithBrands: "Worked with brands",
    badgeProfileComplete: "Profile complete",
    labelFollowers: "Followers",
    labelEngagement: "Engagement",
    withinBudgetLabel: "Within your budget",
    totalCreators: (n: number) => `${n} creators`,

    allPlatforms: "All Platforms",
    anyBudget: "Any Budget",
    allTypes: "All Types",
    allCategories: "All Categories",

    platformInstagram: "Instagram",
    platformTikTok: "TikTok",
    platformYouTube: "YouTube",
    platformFacebook: "Facebook",

    formatReels: "Reels / Short video",
    formatPosts: "Post",
    formatStories: "Story",
    formatOther: "Other",

    advancedFilters: "Advanced",
    typeShortVideo: "Short video",
    typeLongVideo: "Long video",
    typeUGC: "UGC",
    typeLive: "Live",
    typeReviewUnboxing: "Review / Unboxing",
    typeEvent: "Event",
    typeOther: "Other",

    budgetLabel: "Budget",
    budgetOtherAmount: "Other amount…",
    budgetCustomPlaceholder: "Enter amount",
    budgetClearCustom: "Clear",

    budgetRange0_5000: "≤ 5,000",
    budgetRange5000_10000: "5,000–10,000",
    budgetRange10000_30000: "10,000–30,000",
    budgetRange30000_60000: "30,000–60,000",
    budgetRange60000_plus: "60,000+",

    sortBestMatch: "Best Match",
    sortFollowersDesc: "Followers (High)",
    sortErDesc: "Engagement Rate (High)",

    sortRecommended: "Recommended",
    sortNewest: "Newest",
    sortName: "Name A–Z",
    sortFollowers: "Followers (High)",
    sortEngagement: "Engagement Rate (High)",

    myCardBadge: "My Card",
    demoSectionTitle: "Demo",
    demoBadge: "Demo",
    myCardFirstToggle: "My card first",

    filtersButton: "Filters",
    profileNotSet: "Profile not set",
    favoriteAddAria: "Save creator",
    favoriteRemoveAria: "Unsave creator",

    showMoreChips: (n: number) => `+${n} more`,
    showLessChips: "Show less",

    creatorTypeLabel: "Creator Type",

    noTopics: "No topics",
    viewDetails: "Click to view details →",

    favoritesTitle: "Saved creators",
    close: "Close",
    clearAll: "Clear all",
    favoritesCount: (n: number) => `${n} saved`,
    emptyFavorites: "No saved creators yet. Click “Save” on a card.",

    minPriceFrom: (amount: string) => `From NT$${amount}`,

    followersLabel: "Followers",
    engagementLabel: "Engagement",

    recommendedLabel: "Recommended",
    popularBadge: "Popular",
    highEngagementLabel: "High Engagement",

    searchingHelper: "Searching…",
    resultsCountLabel: (n: number) => `${n} creators found`,
    clearSearchCta: "Clear search",
    remoteErrorHint: "Remote search is temporarily unavailable. Showing local results.",

    updatingStats: "Updating stats…",
    retryStatsAria: "Retry stats",

    paginationPrev: "Prev",
    paginationNext: "Next",
    paginationPage: (page: number, total: number) => `Page ${page} / ${total}`,

    platformFilterLabel: "Platforms",
    otherLabel: "Other",
    customCreatorTypePlaceholder: "Custom type",
    clearSearchAria: "Clear search",

    demoEditModeLabel: "Demo edit mode",
    turnOffLabel: "Turn off",

    editCardCta: "Edit card",

    uploadImageCta: "Upload image",
    resetCta: "Reset",

    pageErrorTitle: "Something went wrong",
    pageErrorBody: "Please refresh the page or try again later.",
    pageErrorRetry: "Retry",
  },
}
