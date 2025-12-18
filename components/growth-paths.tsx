"use client"
import React, { useMemo, useRef, useState } from 'react';
import { Button } from "./ui/button"

type Level = "Low" | "Medium" | "High"

type GrowthInput = {
  handle?: string
  platform?: "Instagram" | "Threads" | string
  accountType?: string
  accountAge?: string
  visibility?: string
  posting?: "Low" | "Medium" | "High" | string
  activityTrend?: string
  contentConsistency?: string
  engagementQuality?: "Low" | "Medium" | "High" | string
  interactionPattern?: string
  automationLikelihood?: Level | string
  abnormalBehaviorRisk?: Level | string
  confidence?: number
  contentMix?: {
    photo?: number
    reels?: number
    threads?: number
  }
}

type Path = {
  id: string
  title: string
  subtitle: string
  fitScore: number
  distanceToGoal: number // 0~100，數字越小越接近門檻
  difficulty: "簡單" | "中等" | "困難"
  monetization: "低" | "中" | "高"
  recommendedMix: { photo: number; reels: number; threads: number }
  weeklyActions: string[]
  blockers: string[]
  why: string[]
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n))

const toNum = (v: any, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const levelToNum = (v: any) => {
  if (v === "Low") return 20
  if (v === "Medium") return 55
  if (v === "High") return 85
  return 50
}

const mixNormalize = (mix?: GrowthInput["contentMix"]) => {
  const p = clamp(toNum(mix?.photo, 40))
  const r = clamp(toNum(mix?.reels, 40))
  const t = clamp(toNum(mix?.threads, 20))
  const sum = p + r + t
  if (!sum) return { photo: 40, reels: 40, threads: 20 }
  return {
    photo: Math.round((p / sum) * 100),
    reels: Math.round((r / sum) * 100),
    threads: Math.round((t / sum) * 100),
  }
}

function badge(level: any) {
  const v = String(level)
  if (v === "High") return "bg-red-500/10 border-red-500/30 text-red-300"
  if (v === "Medium") return "bg-amber-500/10 border-amber-500/30 text-amber-300"
  return "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
}

/**
 * IG / Threads 差異權重（假資料邏輯）
 * - IG 偏：內容一致性、Reels、視覺內容比重、穩定發佈
 * - Threads 偏：互動節奏、回覆/對話密度、文字議題、短週期迭代
 */
function platformWeights(platform: string) {
  const isThreads = platform.toLowerCase().includes("thread")
  if (isThreads) {
    return {
      wEngagement: 1.25,
      wInteraction: 1.2,
      wConsistency: 0.9,
      wPosting: 1.05,
      wReels: 0.75,
      wThreadsMix: 1.35,
      riskPenalty: 1.0,
    }
  }
  return {
    wEngagement: 1.05,
    wInteraction: 1.0,
    wConsistency: 1.25,
    wPosting: 1.1,
    wReels: 1.25,
    wThreadsMix: 0.75,
    riskPenalty: 1.15,
  }
}

function computeSignals(input: GrowthInput) {
  const platform = (input.platform || "Instagram").toString()
  const w = platformWeights(platform)

  const engagement = input.engagementQuality === "High" ? 85 : input.engagementQuality === "Medium" ? 60 : 35
  const posting = input.posting === "High" ? 85 : input.posting === "Medium" ? 60 : 35
  const consistency =
    input.contentConsistency?.toLowerCase().includes("consistent") ? 85
      : input.contentConsistency?.toLowerCase().includes("mixed") ? 60
      : input.contentConsistency?.toLowerCase().includes("repet") ? 35
      : 55

  const interaction =
    input.interactionPattern?.toLowerCase().includes("organic") ? 80
      : input.interactionPattern?.toLowerCase().includes("partially") ? 55
      : input.interactionPattern?.toLowerCase().includes("unclear") ? 40
      : 55

  const confidence = clamp(toNum(input.confidence, 72))
  const abnormal = levelToNum(input.abnormalBehaviorRisk)
  const automation = levelToNum(input.automationLikelihood)

  const mix = mixNormalize(input.contentMix)
  const reelsStrength = mix.reels
  const threadsStrength = mix.threads

  // 平台加權後的主分數（0~100）
  const quality =
    (engagement * w.wEngagement +
      interaction * w.wInteraction +
      consistency * w.wConsistency +
      posting * w.wPosting +
      reelsStrength * w.wReels +
      threadsStrength * w.wThreadsMix) /
    (w.wEngagement + w.wInteraction + w.wConsistency + w.wPosting + w.wReels + w.wThreadsMix)

  // 風險扣分（假資料）
  const risk = ((abnormal + automation) / 2) * w.riskPenalty
  const finalScore = clamp(Math.round(quality - risk * 0.25 + confidence * 0.15))

  return {
    platform,
    mix,
    engagement,
    posting,
    consistency,
    interaction,
    confidence,
    risk,
    finalScore,
  }
}

function build8Paths(input: GrowthInput): Path[] {
  const s = computeSignals(input)
  const isThreads = s.platform.toLowerCase().includes("thread")

  // 依平台偏好自動給「建議內容配比」
  const baseMix = isThreads
    ? { photo: 25, reels: 20, threads: 55 }
    : { photo: 35, reels: 50, threads: 15 }

  // 依帳號訊號微調（假資料）
  const adjust = (mix: { photo: number; reels: number; threads: number }) => {
    let { photo, reels, threads } = mix
    if (s.consistency < 55) {
      // 一致性差 → 增加 Threads/系列化文字框架 or IG 走 Reels 系列化
      if (isThreads) threads += 8
      else reels += 8
      photo -= 4
    }
    if (s.engagement < 55) {
      // 互動弱 → Threads 增回覆節奏 / IG 增 Reels hook
      if (isThreads) threads += 6
      else reels += 6
      photo -= 3
    }
    if (s.posting < 55) {
      // 發文頻率低 → 用較省力格式補足
      if (isThreads) threads += 5
      else reels += 5
      photo -= 2
    }
    photo = clamp(photo)
    reels = clamp(reels)
    threads = clamp(threads)
    const sum = photo + reels + threads
    return {
      photo: Math.round((photo / sum) * 100),
      reels: Math.round((reels / sum) * 100),
      threads: Math.round((threads / sum) * 100),
    }
  }

  const recMix = adjust(baseMix)

  // 8 種路線（你昨天說的「8 種」在這裡）
  const templates = [
    {
      id: "creator-deep",
      title: "內容深耕型創作者",
      subtitle: "單一主題做深做透，靠系列化累積權重",
      difficulty: "中等" as const,
      monetization: "中" as const,
      why: ["適合想建立長線個人品牌", "靠內容一致性與系列感提升黏著"],
      weeklyActions: [
        "固定 3 個系列欄目：每週各 1 支/1 串（腳本先寫再拍）",
        "每支內容都加同款開頭 Hook（3 秒內說清楚『你會得到什麼』）",
        "每週做一次：把表現最好的內容改成第二版本（換開頭/封面/標題）",
      ],
      blockers: ["主題太散", "沒有系列化格式", "只靠靈感不靠排程"],
    },
    {
      id: "influencer",
      title: "網紅流量型",
      subtitle: "爆款優先：強 Hook + 高頻測試 + 快速迭代",
      difficulty: "中等" as const,
      monetization: "高" as const,
      why: ["適合想衝曝光與合作", "靠短週期測試把勝率拉高"],
      weeklyActions: [
        "一週 12~20 次測試：同題材不同開頭/不同角度（短版先）",
        "固定 2 種爆款框架：A/B 選擇、Top3 排名、反差對比",
        "每週整理：找出前 20% 表現，複製其『開頭節奏 + 結尾 CTA』",
      ],
      blockers: ["開頭不夠強", "測試次數太少", "沒有可複製模板"],
    },
    {
      id: "live-streamer",
      title: "直播主導流型",
      subtitle: "短內容導流到直播，提高停留與轉單",
      difficulty: "困難" as const,
      monetization: "高" as const,
      why: ["適合有直播/想做直播", "把內容變成固定導流漏斗"],
      weeklyActions: [
        "每次直播剪 5~10 段 10~20 秒精華（固定結尾：今晚幾點直播）",
        "設定『直播固定主題』，每週同一時間，讓觀眾形成習慣",
        "直播前 24 小時：連續 3 支短片預熱（同封面風格）",
      ],
      blockers: ["直播主題不固定", "導流 CTA 太弱", "精華剪輯節奏不夠快"],
    },
    {
      id: "biz-smb",
      title: "商家轉單型（本地/電商）",
      subtitle: "以轉換為目標：案例/口碑/前後對比",
      difficulty: "中等" as const,
      monetization: "高" as const,
      why: ["適合有產品/服務", "把內容直接對應到成交問題"],
      weeklyActions: [
        "每週 3 支：客戶案例（痛點→方案→結果）",
        "每週 2 支：FAQ 破除疑慮（價格/效果/流程/風險）",
        "每週 1 支：幕後與信任（團隊/流程/材料/數據）",
      ],
      blockers: ["只做作品展示沒有『轉換敘事』", "缺少案例與數據", "CTA 沒有下一步"],
    },
    {
      id: "personal-ip",
      title: "個人 IP（專家權威型）",
      subtitle: "建立專業定位：方法論、框架、拆解",
      difficulty: "中等" as const,
      monetization: "高" as const,
      why: ["適合接案/課程/顧問", "長線變現能力強"],
      weeklyActions: [
        "每週 3 支：教學拆解（3 步驟/1 框架/1 公式）",
        "每週 2 支：觀點內容（反直覺、踩雷、迷思）",
        "每週 1 支：實作展示（你怎麼做、怎麼改、怎麼復盤）",
      ],
      blockers: ["定位不清楚", "內容太泛", "缺少可複用框架"],
    },
    {
      id: "community",
      title: "社群互動型（Threads 強項）",
      subtitle: "用對話密度養帳號：回覆、投票、連載",
      difficulty: "簡單" as const,
      monetization: "中" as const,
      why: ["Threads 更吃互動", "快速累積曝光與關係鏈"],
      weeklyActions: [
        "每日 10~20 則高品質回覆（鎖定同領域大帳與熱門串）",
        "每週 3 篇『連載』：固定格式（第 X 集）",
        "每週 2 次：投票/二選一/請大家給建議（引留言）",
      ],
      blockers: ["只發不回", "沒有固定互動節奏", "內容不夠引戰（健康辯論）"],
    },
    {
      id: "ugc",
      title: "UGC 模板量產型",
      subtitle: "用可複製模板批量產出，靠量與一致性取勝",
      difficulty: "簡單" as const,
      monetization: "中" as const,
      why: ["適合想省腦力", "只要模板夠好就能穩定輸出"],
      weeklyActions: [
        "建立 5 個固定模板（標題/開頭/結尾）",
        "每週同模板做 8~15 支（只換題材與案例）",
        "每週把最強模板再拆成 3 個變體（開頭/節奏/CTA）",
      ],
      blockers: ["模板不夠強", "視覺/封面不一致", "缺少變體導致疲勞"],
    },
    {
      id: "collab",
      title: "合作邀請型（商案獲取）",
      subtitle: "把帳號包裝成『可合作的產品』",
      difficulty: "中等" as const,
      monetization: "高" as const,
      why: ["適合想接業配/合作", "讓品牌快速看懂你的價值"],
      weeklyActions: [
        "建立『合作案例牆』：3 個代表作品（成果/數據/受眾）",
        "每週 2 支：你能幫品牌解決什麼（用例與情境）",
        "固定置頂：合作方式、報價範圍、聯絡方式（Demo 可先假資料）",
      ],
      blockers: ["價值主張不清楚", "缺少案例/數據", "合作入口不明顯"],
    },
  ]

  // 依帳號狀態算每條路線分數（假資料公式：finalScore + 各路線偏好加成）
  const scoreFor = (id: string) => {
    let score = s.finalScore

    const lowRiskBonus = s.risk < 55 ? 6 : s.risk < 75 ? 2 : -8
    const highEngBonus = s.engagement >= 60 ? 4 : -4
    const highConsBonus = s.consistency >= 60 ? 5 : -5
    const interactionBonus = s.interaction >= 60 ? 5 : -3
    const postingBonus = s.posting >= 60 ? 4 : -4

    // 路線偏好
    if (id === "creator-deep") score += highConsBonus + postingBonus
    if (id === "influencer") score += highEngBonus + postingBonus - (s.consistency < 55 ? 2 : 0)
    if (id === "live-streamer") score += interactionBonus + postingBonus - 2
    if (id === "biz-smb") score += highConsBonus + lowRiskBonus
    if (id === "personal-ip") score += highConsBonus + highEngBonus + lowRiskBonus
    if (id === "community") score += interactionBonus + (isThreads ? 6 : -2)
    if (id === "ugc") score += postingBonus + (s.consistency >= 60 ? 3 : -1)
    if (id === "collab") score += lowRiskBonus + highEngBonus

    // 平台加成（假資料）
    if (isThreads) {
      if (id === "community") score += 8
      if (id === "creator-deep") score -= 2
      if (id === "biz-smb") score -= 2
    } else {
      if (id === "influencer") score += 4
      if (id === "ugc") score += 2
      if (id === "community") score -= 3
    }

    return clamp(Math.round(score))
  }

  const paths: Path[] = templates.map((t) => {
    const fit = scoreFor(t.id)
    // distanceToGoal：假設 85 為「接近門檻」
    const distance = clamp(100 - Math.round((fit / 85) * 100))
    return {
      ...t,
      fitScore: fit,
      distanceToGoal: distance,
      recommendedMix: recMix,
    }
  })


  return paths
}

export default function GrowthPaths({ result }: { result: GrowthInput }) {
  const paths = useMemo(() => build8Paths(result), [result])
  const [selectedId, setSelectedId] = useState<string | null>(paths[0]?.id || null)
  const selected = selectedId ? paths.find((p) => p.id === selectedId) : paths[0]
  const platformLabel = (result.platform || "Instagram").toString()
  const mix = mixNormalize(result.contentMix)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const [isProModalOpen, setIsProModalOpen] = useState(false)

  const handleContextualUpgrade = () => {
    setIsProModalOpen(true)
  }

  const handleUpgradeClick = () => {
    const el = document.getElementById("results-pro-upgrade")
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => {
      const btn = document.getElementById("results-pro-upgrade") as HTMLButtonElement | null
      btn?.click()
    }, 200)
  }

  const handleSelectPath = (id: string) => {
    setSelectedId(id)
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-100">Recommended Paths</h3>
          <span className="text-xs bg-blue-600/20 text-blue-300 px-2.5 py-1 rounded-full font-medium">
            {paths.length} options
          </span>
        </div>

        <div className="rounded-lg border p-4 bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">成長路線分析（模擬）</div>
              <div className="text-lg font-semibold">
                {result.handle ? `@${result.handle}` : "（未提供帳號）"} · {platformLabel}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border px-2 py-1 text-muted-foreground">
                信心分數：{toNum(result.confidence, 72)}%
              </span>
              <span className={`rounded-full border px-2 py-1 ${badge(result.abnormalBehaviorRisk)}`}>
                風險：{String(result.abnormalBehaviorRisk || "Medium")}
              </span>
              <span className={`rounded-full border px-2 py-1 ${badge(result.automationLikelihood)}`}>
                自動化：{String(result.automationLikelihood || "Medium")}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-slate-50/5 p-3">
              <div className="text-xs text-muted-foreground mb-1">平台偏好配比（建議）</div>
              <div className="text-sm">
                <div>Photo：{paths[0]?.recommendedMix.photo}%</div>
                <div>Reels：{paths[0]?.recommendedMix.reels}%</div>
                <div>Threads：{paths[0]?.recommendedMix.threads}%</div>
              </div>
            </div>

            <div className="rounded-md bg-slate-50/5 p-3">
              <div className="text-xs text-muted-foreground mb-1">你目前的配比（輸入）</div>
              <div className="text-sm">
                <div>Photo：{mix.photo}%</div>
                <div>Reels：{mix.reels}%</div>
                <div>Threads：{mix.threads}%</div>
              </div>
            </div>

            <div className="rounded-md bg-slate-50/5 p-3">
              <div className="text-xs text-muted-foreground mb-1">Top3 建議</div>
              <div className="text-sm">
                依平台權重 + 帳號訊號計算（假資料）
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {paths.map((path) => {
            const isSelected = selectedId === path.id
            return (
              <button
                key={path.id}
                onClick={() => handleSelectPath(path.id)}
                className={`text-left p-3.5 rounded-lg border transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                    : "border-slate-700 hover:border-slate-600 bg-slate-800/50 hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className={`font-medium ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}>
                    {path.title}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    path.difficulty === '困難'
                      ? 'bg-red-500/20 text-red-300'
                      : path.difficulty === '中等'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {path.difficulty}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{path.subtitle}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        isSelected ? 'bg-blue-500' : 'bg-slate-600'
                      }`}
                      style={{ width: `${100 - path.distanceToGoal}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    isSelected ? 'text-blue-300' : 'text-slate-400'
                  }`}>
                    {100 - path.distanceToGoal}%
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {selected && (
          <div ref={detailRef} className="rounded-lg border p-4 bg-slate-50/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{selected.title}</div>
                <div className="text-sm text-muted-foreground">{selected.subtitle}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border px-2 py-1">適配度：{selected.fitScore}%</span>
                <span className="rounded-full border px-2 py-1 text-muted-foreground">
                  距離門檻：{selected.distanceToGoal}%
                </span>
                <span className="rounded-full border px-2 py-1">難度：{selected.difficulty}</span>
                <span className="rounded-full border px-2 py-1">變現：{selected.monetization}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-slate-50/5 p-3">
                <div className="text-xs text-muted-foreground mb-2">為什麼推薦你</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {selected.why.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md bg-slate-50/5 p-3">
                <div className="text-xs text-muted-foreground mb-2">本週行動（直接照做）</div>
                <ol className="text-sm list-decimal pl-5 space-y-1">
                  {selected.weeklyActions.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md bg-slate-50/5 p-3">
                <div className="text-xs text-muted-foreground mb-2">主要卡點</div>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {selected.blockers.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md bg-slate-50/5 p-3">
                <div className="text-xs text-muted-foreground mb-2">建議內容配比（平台導向）</div>
                <div className="text-sm space-y-1">
                  <div>Photo · {selected.recommendedMix.photo}%</div>
                  <div>Reels · {selected.recommendedMix.reels}%</div>
                  <div>Threads · {selected.recommendedMix.threads}%</div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              提示：目前為 Demo 假資料邏輯；未連接 IG/Threads API，也不會讀取私人資料。
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                onClick={handleContextualUpgrade}
              >
                查看進階分析（Pro）
              </Button>
            </div>
          </div>
        )}

        {isProModalOpen && (
          <div className="fixed inset-0 z-[70]">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsProModalOpen(false)}
            />
            <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
              <div className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-400">你正在查看</div>
                    <div className="mt-1 text-lg font-semibold text-white leading-snug">
                      {selected?.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-300 leading-relaxed">
                      {selected?.subtitle}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-slate-200 hover:bg-white/5"
                    onClick={() => setIsProModalOpen(false)}
                  >
                    關閉
                  </Button>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium text-white">解鎖 Pro 可看到</div>
                  <ul className="mt-2 text-sm text-slate-200 space-y-1.5">
                    <li>更完整的路線拆解（為什麼適合你、如何執行、避雷點）</li>
                    <li>更清楚的成長計畫與優先順序（下一步先做什麼）</li>
                    <li>更多可複製的內容/互動模板（降低試錯成本）</li>
                  </ul>
                </div>

                <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5"
                    onClick={() => setIsProModalOpen(false)}
                  >
                    先不要
                  </Button>
                  <Button
                    type="button"
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
                    onClick={() => {
                      setIsProModalOpen(false)
                      handleUpgradeClick()
                    }}
                  >
                    升級 Pro 解鎖
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 免費版提示（你之後做付費牆可以用） */}
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          免費版僅顯示 Top3 成長路線與摘要建議；「超詳細分析 / 商業價值 / 合作邀請機率」可做成訂閱功能（例如 NT$99/月）。
        </div>
      </div>
    </div>
  )
}
