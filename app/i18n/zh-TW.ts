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

    sortRecommended: "推薦",
    sortNewest: "最新",
    sortName: "名稱 A–Z",
    sortFollowers: "粉絲數（高→低）",
    sortEngagement: "互動率（高→低）",

    noTopics: "尚無標籤",
    viewDetails: "點擊查看 →",

    favoritesTitle: "已收藏的創作者",
    close: "關閉",
    clearAll: "清除全部",
    favoritesCount: (n: number) => `${n} 位已收藏`,
    emptyFavorites: "尚未收藏任何創作者。請在卡片點選「收藏」。",

    followersLabel: "粉絲",
    engagementLabel: "互動率",
  },
}
