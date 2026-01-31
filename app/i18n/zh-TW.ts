import type { CopyDictionary } from "./types"

export const zhTW: CopyDictionary = {
  common: {
    save: "收藏",
    saved: "已收藏",
    favorites: "已收藏",
    all: "全部",
    searchPlaceholder: "搜尋名稱 / 帳號 / 關鍵字…",
  },
  matchmaking: {
    title: "媒合配對",
    description: "依平台、預算、合作形式篩選創作者",
    totalCreators: (n: number) => `${n} 位創作者`,

    allPlatforms: "全部平台",
    anyBudget: "任何預算",
    allTypes: "全部類型",
    allCategories: "全部分類",

    platformInstagram: "Instagram",
    platformTikTok: "TikTok",
    platformYouTube: "YouTube",
    platformFacebook: "Facebook",

    formatReels: "Reels / 短影音",
    formatPosts: "貼文",
    formatStories: "限時動態",
    formatOther: "其他",

    advancedFilters: "更多篩選",
    typeShortVideo: "短影音",
    typeLongVideo: "長影音",
    typeUGC: "UGC",
    typeLive: "直播",
    typeReviewUnboxing: "開箱 / 評測",
    typeEvent: "活動",
    typeOther: "其他",

    budgetLabel: "預算",
    budgetOtherAmount: "其他金額…",
    budgetCustomPlaceholder: "輸入金額",
    budgetClearCustom: "清除",

    budgetRange0_5000: "≤ 5,000",
    budgetRange5000_10000: "5,000–10,000",
    budgetRange10000_30000: "10,000–30,000",
    budgetRange30000_60000: "30,000–60,000",
    budgetRange60000_plus: "60,000+",

    sortBestMatch: "最佳媒合",
    sortFollowersDesc: "粉絲數（高→低）",
    sortErDesc: "互動率（高→低）",

    sortRecommended: "推薦",
    sortNewest: "最新",
    sortName: "名稱 A–Z",
    sortFollowers: "粉絲數（高→低）",
    sortEngagement: "互動率（高→低）",

    myCardBadge: "我的名片",
    myCardFirstToggle: "我的名片置頂",

    filtersButton: "篩選",
    profileNotSet: "尚未設定名片",
    favoriteAddAria: "收藏創作者",
    favoriteRemoveAria: "取消收藏",

    showMoreChips: (n: number) => `+${n} 更多`,
    showLessChips: "收合",

    noTopics: "尚無標籤",
    viewDetails: "點擊查看 →",

    favoritesTitle: "已收藏的創作者",
    close: "關閉",
    clearAll: "清除全部",
    favoritesCount: (n: number) => `${n} 位已收藏`,
    emptyFavorites: "尚未收藏任何創作者。請在卡片點選「收藏」。",

    minPriceFrom: (amount: string) => `接案金額 NT$${amount} 起`,

    followersLabel: "粉絲",
    engagementLabel: "互動率",

    recommendedLabel: "推薦",
    popularBadge: "人氣",
    highEngagementLabel: "互動亮眼",
    bestMatchTooltip: "最可能成交會綜合預算匹配、互動與粉絲規模。",

    updatingStats: "更新數據中…",
    retryStatsAria: "重新取得數據",
  },
}
