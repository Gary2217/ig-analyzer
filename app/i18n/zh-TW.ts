import type { CopyDictionary } from "./types"

export const zhTW: CopyDictionary = {
  common: {
    save: "收藏",
    saved: "已收藏",
    favorites: "已收藏",
    all: "全部",
    searchPlaceholder: "搜尋名稱 / 帳號 / 關鍵字…",
    clear: "清除",
    add: "新增",
  },
  settingsIgAccountsTitle: "我的 Instagram 帳號",
  settingsIgAccountsEmpty: "目前沒有連結的 Instagram 帳號。",
  settingsIgAccountsUnauthorized: "請先登入。",
  settingsIgAccountsDisabled: "Instagram accounts 功能尚未啟用。",
  settingsIgAccountsConnected: "已連結",
  settingsIgAccountsExpired: "Token 已過期",
  settingsIgAccountsNoToken: "無 Token",
  igHeaderNotLinked: "未連結",
  igHeaderLinkedPrefix: "IG:",
  igHeaderMultipleSuffix: "+{n}",
  igHeaderPendingBadge: "待完成",
  igHeaderLoading: "載入中",
  igSelectorTitle: "Instagram 帳號",
  igSelectorEmpty: "沒有已連結的 Instagram 帳號",
  igSelectorLoading: "載入中…",
  igSelectorActive: "使用中",
  igSelectorClose: "關閉",
  matchmaking: {
    title: "媒合配對",
    description: "依平台、預算、合作形式篩選創作者",
    pageTitle: "創作者名片區",
    pageSubtitleLine1: "找到符合預算、能帶轉換的創作者",
    pageSubtitleLine2: "用互動率與價格快速比較，一鍵開始洽談合作。",
    pageHeadline: "找到符合預算、能帶轉換的創作者",
    pageSubheadline: "用互動率與價格快速比較，一鍵開始洽談合作。",
    loadingHelper: "正在為你配對最合適的創作者…",
    emptyResultsTitle: "沒有符合條件的創作者",
    emptyResultsHint: "你可以試試放寬平台、預算或類型篩選，或清除部分條件。",
    bestMatchHelper: "最可能成交會綜合互動、粉絲規模與你選的預算。",
    ctaStartCollaboration: "開始洽談合作",
    badgeWorkedWithBrands: "有合作案例",
    badgeProfileComplete: "資料完整",
    labelFollowers: "粉絲",
    labelEngagement: "互動率",
    withinBudgetLabel: "符合預算",
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
    demoSectionTitle: "示範",
    demoBadge: "示範",
    myCardFirstToggle: "我的名片置頂",

    filtersButton: "篩選",
    profileNotSet: "尚未設定名片",
    favoriteAddAria: "收藏創作者",
    favoriteRemoveAria: "取消收藏",

    showMoreChips: (n: number) => `+${n} 更多`,
    showLessChips: "收合",

    creatorTypeLabel: "創作者類型",

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

    searchingHelper: "搜尋中…",
    resultsCountLabel: (n: number) => `找到 ${n} 位創作者`,
    clearSearchCta: "清除搜尋",
    remoteErrorHint: "遠端搜尋暫時不可用，已顯示本地結果。",

    updatingStats: "更新數據中…",
    retryStatsAria: "重新取得數據",

    paginationPrev: "上一頁",
    paginationNext: "下一頁",
    paginationPage: (page: number, total: number) => `第 ${page} / ${total} 頁`,

    platformFilterLabel: "創作者平台",
    otherLabel: "其他",
    customCreatorTypePlaceholder: "輸入自訂類型",
    clearSearchAria: "清除搜尋",

    demoEditModeLabel: "示範編輯模式",
    turnOffLabel: "關閉",

    editCardCta: "編輯名片",

    uploadImageCta: "上傳圖片",
    resetCta: "重設",

    pageErrorTitle: "頁面載入失敗",
    pageErrorBody: "請重新整理或稍後再試。",
    pageErrorRetry: "重試",
  },
}
