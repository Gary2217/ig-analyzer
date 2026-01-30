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

    formatLabel: "Format",
    allFormats: "All formats",
    formatReels: "Reels / Short video",
    formatPosts: "Post",
    formatStories: "Story",
    formatUGC: "UGC",
    formatLive: "Live",
    formatYouTube: "YouTube",
    formatTikTok: "TikTok",
    formatFacebook: "Facebook",
    formatReviewUnboxing: "Review / Unboxing",
    formatEvent: "Event",
    formatOther: "Other",

    sortRecommended: "Recommended",
    sortNewest: "Newest",
    sortName: "Name A–Z",
    sortFollowers: "Followers (High)",
    sortEngagement: "Engagement Rate (High)",

    noTopics: "No topics",
    viewDetails: "Click to view details →",

    favoritesTitle: "Saved creators",
    close: "Close",
    clearAll: "Clear all",
    favoritesCount: (n: number) => `${n} saved`,
    emptyFavorites: "No saved creators yet. Click “Save” on a card.",

    followersLabel: "Followers",
    engagementLabel: "Engagement",
  },
}
