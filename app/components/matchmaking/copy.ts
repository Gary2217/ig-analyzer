export type MatchmakingLocale = "zh-TW" | "en"

export function getCopy(locale: MatchmakingLocale) {
  const isZh = locale === "zh-TW"

  return {
    locale,

    heading: isZh ? "媒合配對" : "Matchmaking",
    subheading: isZh ? "依平台、預算、合作形式篩選創作者" : "Filter creators by platform, budget, and collaboration type.",

    searchPlaceholder: isZh ? "搜尋名稱 / 帳號 / 關鍵字…" : "Search name / handle / keyword...",

    totalCreators: (n: number) => (isZh ? `${n} 位創作者` : `${n} creators`),

    allPlatforms: isZh ? "全部平台" : "All Platforms",
    anyBudget: isZh ? "任何預算" : "Any Budget",
    allTypes: isZh ? "全部類型" : "All Types",
    allCategories: isZh ? "全部分類" : "All Categories",

    platformInstagram: isZh ? "Instagram" : "Instagram",
    platformTikTok: isZh ? "TikTok" : "TikTok",
    platformYouTube: isZh ? "YouTube" : "YouTube",
    platformFacebook: isZh ? "Facebook" : "Facebook",

    sortRecommended: isZh ? "推薦" : "Recommended",
    sortNewest: isZh ? "最新" : "Newest",
    sortName: isZh ? "名稱 A–Z" : "Name A–Z",
    sortFollowers: isZh ? "粉絲數（高→低）" : "Followers (High)",
    sortEngagement: isZh ? "互動率（高→低）" : "Engagement Rate (High)",

    budgetAny: isZh ? "任何預算" : "Any Budget",
    budget0_5000: isZh ? "≤ 5,000" : "≤ 5,000",
    budget5000_10000: isZh ? "5,000–10,000" : "5,000–10,000",
    budget10000_30000: isZh ? "10,000–30,000" : "10,000–30,000",
    budget30000_60000: isZh ? "30,000–60,000" : "30,000–60,000",
    budget60000Plus: isZh ? "60,000+" : "60,000+",

    collabAny: isZh ? "全部類型" : "All Types",
    collabShortVideo: isZh ? "短影音" : "Short Video",
    collabLongVideo: isZh ? "長影音" : "Long Video",
    collabLive: isZh ? "直播" : "Live",
    collabUgc: isZh ? "UGC" : "UGC",
    collabReviewUnboxing: isZh ? "開箱 / 評測" : "Review/Unboxing",
    collabEvent: isZh ? "活動" : "Event",
    collabOther: isZh ? "其他" : "Other",

    saved: isZh ? "已收藏" : "Saved",
    save: isZh ? "收藏" : "Save",
    savedState: isZh ? "已收藏" : "Saved",

    savedCreatorsTitle: isZh ? "已收藏的創作者" : "Saved creators",
    close: isZh ? "關閉" : "Close",
    clearAll: isZh ? "清除全部" : "Clear all",
    savedCount: (n: number) => (isZh ? `${n} 位已收藏` : `${n} saved`),

    noTopics: isZh ? "尚無標籤" : "No topics",
    followersLabel: isZh ? "粉絲" : "Followers",
    engagementLabel: isZh ? "互動率" : "Engagement",

    viewDetailsHint: isZh ? "點擊查看 →" : "Click to view details →",

    noSavedEmpty: isZh ? "尚未收藏任何創作者。請在卡片點選「收藏」。" : "No saved creators yet. Click “Save” on a card.",
  }
}
