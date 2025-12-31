"use client"

import * as React from "react"
import { useState } from "react"
import { CheckIcon, DashIcon } from "../../../components/ui/plan-feature-icons"

export default function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const { locale } = React.use(params)
  const isZh = locale === "zh-TW"

  const closeModal = () => {
    setIsOpen(false)
    setEmail("")
    setSubmitted(false)
  }

  return (
    <main className="min-h-screen bg-[#0b1220] text-white px-6 py-14">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {isZh ? "升級 Pro" : "Upgrade to Pro"}
          </h1>
          <p className="mt-3 text-white/70">
            {isZh
              ? "左邊是你現在的免費預覽；右邊是升級後解鎖的完整分析。"
              : "Left is your Free preview; right is the full Pro unlock."}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {isZh
              ? "適合：創作者／品牌經營者／想提升互動與變現的人"
              : "For creators, brands, and growth-focused teams."}
          </p>

          {/* ===== Quick navigation actions ===== */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {/* Back to account analysis */}
            <a
              href={`/${locale}/results`}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 sm:w-auto"
            >
              {isZh ? "回到分析帳號" : "Back to Account Analysis"}
            </a>

            {/* Go to post analysis */}
            <a
              href={`/${locale}/post-analysis`}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 sm:w-auto"
            >
              {isZh ? "分析貼文" : "Analyze a Post"}
            </a>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
          <div id="pro" className="hidden" />
          <div className="order-2 lg:order-1 h-full flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-white/80">{isZh ? "目前方案" : "Current plan"}</div>
                <div className="mt-1 text-2xl font-bold">{isZh ? "免費預覽" : "Free preview"}</div>
                <div className="mt-2 text-sm text-white/65">
                  {isZh ? "你現在在 Results 頁看到的內容" : "What you see on the Results page today"}
                </div>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">FREE</span>
            </div>

            <ul className="mt-6 flex-1 space-y-3 text-sm text-white/90">
              <li className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 text-white/35 mt-0.5 shrink-0" />
                <span>{isZh ? "基本資料（追蹤者 / 貼文數）" : "Basics (followers / posts)"}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 text-white/35 mt-0.5 shrink-0" />
                <span>{isZh ? "KPI 摘要（互動率 / 按讚 / 留言）" : "KPI summary (ER / likes / comments)"}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 text-white/35 mt-0.5 shrink-0" />
                <span>{isZh ? "Top Posts（僅 Top 3）" : "Top posts (Top 3 only)"}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 text-white/35 mt-0.5 shrink-0" />
                <span>{isZh ? "洞察與建議（摘要）" : "Insights & recommendations (summary)"}</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <DashIcon className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
                <span>{isZh ? "深度貼文診斷（逐篇）" : "Deep post-level diagnosis"}</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <DashIcon className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
                <span>{isZh ? "一週成長行動清單（依目標）" : "Weekly action checklist (by goal)"}</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <DashIcon className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
                <span>{isZh ? "下載報告（PDF / Notion）" : "Downloadable report (PDF / Notion)"}</span>
              </li>
            </ul>

            <div className="mt-auto pt-6">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                {isZh
                  ? "免費版保留核心數據，但你仍需要自己判斷「下一步該做什麼」。"
                  : "Free keeps the core numbers, but you still decide the next steps yourself."}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 h-full flex flex-col rounded-2xl border border-violet-400/30 bg-gradient-to-b from-violet-500/20 via-indigo-500/15 to-indigo-500/20 p-6 shadow-xl">
            <div className="pb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{isZh ? "Pro 完整分析" : "Pro Full Analysis"}</h3>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{isZh ? "PRO・推薦" : "PRO · Recommended"}</span>
              </div>

              <p className="text-sm text-white/85 leading-relaxed mt-1">
                {isZh ? "從「漂亮預覽」升級為" : "Upgrade from a pretty preview to"}
                <br />
                <span className="font-medium text-white">
                  {isZh ? "可執行的成長計畫與行動清單" : "an actionable growth plan and checklist"}
                </span>
              </p>
            </div>

            <div className="flex flex-col flex-1">
              <ul className="flex-1 space-y-3 text-sm text-white/90">
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "基本資料（追蹤者 / 貼文數）" : "Basics (followers / posts)"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "KPI 摘要（互動率 / 按讚 / 留言）" : "KPI summary (ER / likes / comments)"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "Top Posts（僅 Top 3）" : "Top posts (Top 3 only)"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "洞察與建議（摘要）" : "Insights & recommendations (summary)"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "深度貼文診斷（逐篇）" : "Deep post-level diagnosis"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "一週成長行動清單（依目標）" : "Weekly action checklist (by goal)"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <span>{isZh ? "下載報告（PDF / Notion）" : "Downloadable report (PDF / Notion)"}</span>
                </li>
              </ul>

              <div className="mt-6 rounded-xl bg-white/10 p-4 text-sm text-white/85">
                <div className="font-semibold">{isZh ? "Pro 會直接告訴你下一步" : "Pro tells you the next step"}</div>
                <div className="mt-1">
                  {isZh ? "把「漂亮數據」變成「可執行的成長行動」。" : "Turn numbers into actionable growth moves."}
                  <br />
                  {isZh ? "你會清楚知道：" : "You’ll know exactly:"}
                  <br />
                  {isZh ? "- 下一篇該做什麼" : "- What to post next"}
                  <br />
                  {isZh ? "- 哪個指標最該先拉" : "- Which metric to improve first"}
                  <br />
                  {isZh ? "- How to boost engagement and performance" : "- How to boost engagement and performance"}
                </div>
              </div>

              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-sm font-semibold"
                >
                  {isZh ? "立即升級 Pro（即將推出）" : "Upgrade to Pro (Coming soon)"}
                </button>
                <p className="mt-2 text-center text-xs text-white/60">
                  {isZh ? "UI 預覽中｜現在不會扣款，可隨時關閉" : "UI preview only — no charge yet. You can close anytime."}
                </p>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/70">
                  <span className="mr-2">🔒</span>
                  {isZh ? "不綁卡｜不扣款｜之後接 Stripe 才會開放" : "No card · No charge · Billing after Stripe integration"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {isZh ? "Pro 內容示意（你會拿到什麼）" : "What you get in Pro (preview)"}
              </h2>
              <p className="mt-1 text-sm text-white/65 leading-relaxed break-words">
                {isZh
                  ? "這段用來展示 Pro 的結構：Top Posts、可執行清單、目標路線。"
                  : "A structured preview: Top posts, an actionable checklist, and goal-based paths."}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              {isZh ? "UI 預覽" : "UI Preview"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{isZh ? "Top 3 最強貼文" : "Top 3 Posts"}</div>
                <span className="text-xs text-white/50">🔒</span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/80">
                {[
                  isZh ? "第 1 名（含內文/時間/拆解）" : "#1 (caption/timing/breakdown)",
                  isZh ? "第 2 名（含內文/時間/拆解）" : "#2 (caption/timing/breakdown)",
                  isZh ? "第 3 名（含內文/時間/拆解）" : "#3 (caption/timing/breakdown)",
                ].map((txt, i) => (
                  <div key={`pricing-pro-top-${i}`} className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="truncate">{txt}</div>
                    <div className="mt-1 text-xs text-white/55 truncate">
                      {isZh ? "為什麼表現好 + 可複製模板" : "Why it worked + reusable templates"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{isZh ? "一週行動清單" : "Weekly Action Checklist"}</div>
                <span className="text-xs text-white/50">🔒</span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/80">
                {[
                  isZh ? "Hook 前兩行：更快抓住人" : "Rewrite the first 2 lines (Hook)",
                  isZh ? "CTA：留言/收藏/私訊引導" : "Add a clear CTA (comments/saves/DM)",
                  isZh ? "固定版型與節奏（7 天）" : "Stabilize cadence (7 days)",
                  isZh ? "內容主題收斂，降低發散" : "Reduce topic variance",
                  isZh ? "加入變現素材（方案/案例）" : "Add monetization assets (offers/proof)",
                ].map((txt, i) => (
                  <label
                    key={`pricing-pro-check-${i}`}
                    className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <input type="checkbox" className="mt-1" disabled />
                    <span className="min-w-0 break-words leading-relaxed">{txt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{isZh ? "目標路線（成長/互動/變現）" : "Goal Paths (Growth/Engagement/Monetize)"}</div>
                <span className="text-xs text-white/50">🔒</span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/80">
                {[
                  { title: isZh ? "成長粉絲" : "Grow followers", desc: isZh ? "版型 + 節奏 + 分發穩定" : "Format + cadence + stable distribution" },
                  { title: isZh ? "提高互動" : "Boost engagement", desc: isZh ? "Hook + CTA + 留言互動速度" : "Hook + CTA + faster comment loops" },
                  { title: isZh ? "變現" : "Monetize", desc: isZh ? "方案/案例/引流素材排程" : "Offers/proof/lead magnets planning" },
                ].map((x, i) => (
                  <div key={`pricing-pro-goal-${i}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="font-semibold">{x.title}</div>
                    <div className="mt-1 text-xs text-white/60 break-words">{x.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 px-6 py-6">
          <h2 className="text-lg font-semibold">{isZh ? "常見問題" : "FAQ"}</h2>
          <div className="mt-4 space-y-4 text-sm text-white/70">
            <p>
              <span className="font-semibold text-white/85">{isZh ? "免費版會有什麼限制？" : "What are the limits of Free?"}</span>
              <br />
              {isZh
                ? "只能看到摘要與 Top 內容；深度診斷、行動清單與下載報告需 Pro。"
                : "You get summaries and top content. Deep diagnosis, checklists, and downloads require Pro."}
            </p>
            <p>
              <span className="font-semibold text-white/85">{isZh ? "什麼時候適合升級？" : "When should I upgrade?"}</span>
              <br />
              {isZh
                ? "當你想把數據變成「可執行的成長行動」時。"
                : "When you want to turn numbers into an actionable growth plan."}
            </p>
            <p>
              <span className="font-semibold text-white/85">{isZh ? "為什麼現在不能付款？" : "Why can’t I pay yet?"}</span>
              <br />
              {isZh
                ? "目前提供 UI 預覽；之後接 Stripe 即可開放訂閱。"
                : "This is a UI preview. Billing will be enabled after Stripe integration."}
            </p>
          </div>
        </section>

        <div className="mt-6 text-center text-xs text-white/45">
          © {new Date().getFullYear()} Social Analytics · {isZh ? "Pro 訂閱即將推出" : "Pro subscription coming soon"}
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
            aria-label="Close"
          />

          <div className="relative mx-auto flex h-full w-full max-w-lg items-center justify-center px-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full rounded-2xl border border-white/12 bg-[#0b1220] p-6 text-white shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{isZh ? "Pro 即將推出" : "Pro is coming"}</div>
                  <div className="mt-1 text-sm text-white/70">
                    {isZh ? "留下 Email，我們會在 Pro 上線第一時間通知你" : "Leave your email and we’ll notify you when Pro launches"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="shrink-0 rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                  aria-label="Close"
                >
                  X
                </button>
              </div>

              {submitted ? (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                  {isZh ? "已收到，我們會通知你" : "Got it — we’ll notify you"}
                </div>
              ) : (
                <form
                  className="mt-6 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSubmitted(true)
                  }}
                >
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder={isZh ? "you@example.com" : "you@example.com"}
                    className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/25"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-sm font-semibold"
                  >
                    {isZh ? "通知我" : "Notify me"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
