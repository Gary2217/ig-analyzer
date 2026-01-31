import type { CopyDictionary } from "./types"

export const en: CopyDictionary = {
  common: {
    save: "Save",
    saved: "Saved",
    favorites: "Saved",
    all: "All",
    searchPlaceholder: "Search name / handle / keyword...",
  },
  matchmaking: {
    title: "Matchmaking",
    description: "Filter creators by platform, budget, and collaboration type.",
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
    myCardFirstToggle: "My card first",

    filtersButton: "Filters",
    profileNotSet: "Profile not set",
    favoriteAddAria: "Save creator",
    favoriteRemoveAria: "Unsave creator",

    showMoreChips: (n: number) => `+${n} more`,
    showLessChips: "Show less",

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
    bestMatchTooltip: "Best Match weighs budget fit, engagement, and audience size.",

    updatingStats: "Updating stats…",
    retryStatsAria: "Retry stats",
  },
}
