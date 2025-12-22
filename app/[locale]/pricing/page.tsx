"use client"

import { useState } from "react"

export default function PricingPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

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
            升級 Pro
          </h1>
          <p className="mt-3 text-white/70">
            左邊是你現在的免費預覽；右邊是升級後解鎖的完整分析。
          </p>
          <p className="mt-2 text-sm text-white/60">適合：創作者／品牌經營者／想提升互動與變現的人</p>
        </div>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
          <div className="order-2 lg:order-1 h-full flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-white/80">目前方案</div>
                <div className="mt-1 text-2xl font-bold">免費預覽</div>
                <div className="mt-2 text-sm text-white/65">你現在在 Results 頁看到的內容</div>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">FREE</span>
            </div>

            <ul className="mt-6 flex-1 space-y-3 text-sm text-white/90">
              <li className="flex items-start gap-2">
                <span className="leading-6">✅</span>
                <span>基本資料（追蹤者 / 貼文數）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="leading-6">✅</span>
                <span>KPI 摘要（互動率 / 按讚 / 留言）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="leading-6">✅</span>
                <span>Top Posts（僅 Top 3）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="leading-6">✅</span>
                <span>洞察與建議（摘要）</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <span className="leading-6">⛔</span>
                <span>深度貼文診斷（逐篇）</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <span className="leading-6">⛔</span>
                <span>一週成長行動清單（依目標）</span>
              </li>
              <li className="flex items-start gap-2 text-white/35 line-through">
                <span className="leading-6">⛔</span>
                <span>下載報告（PDF / Notion）</span>
              </li>
            </ul>

            <div className="mt-auto pt-6">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">免費版保留核心數據，但你仍需要自己判斷「下一步該做什麼」。</div>
            </div>
          </div>

          <div className="order-1 lg:order-2 h-full flex flex-col rounded-2xl border border-violet-400/30 bg-gradient-to-b from-violet-500/20 via-indigo-500/15 to-indigo-500/20 p-6 shadow-xl">
            <div className="pb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Pro 完整分析</h3>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">PRO・推薦</span>
              </div>

              <p className="text-sm text-white/85 leading-relaxed mt-1">
                從「漂亮預覽」升級為
                <br />
                <span className="font-medium text-white">可執行的成長計畫與行動清單</span>
              </p>
            </div>

            <div className="flex flex-col flex-1">
              <ul className="flex-1 space-y-3 text-sm text-white/90">
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>基本資料（追蹤者 / 貼文數）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>KPI 摘要（互動率 / 按讚 / 留言）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>Top Posts（僅 Top 3）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>洞察與建議（摘要）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>深度貼文診斷（逐篇）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>一週成長行動清單（依目標）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="leading-6">✅</span>
                  <span>下載報告（PDF / Notion）</span>
                </li>
              </ul>

              <div className="mt-6 rounded-xl bg-white/10 p-4 text-sm text-white/85">
                <div className="font-semibold">Pro 會直接告訴你下一步</div>
                <div className="mt-1">
                  把「漂亮數據」變成「可執行的成長行動」。
                  <br />
                  你會清楚知道：
                  <br />
                  - 下一篇該做什麼
                  <br />
                  - 哪個指標最該先拉
                  <br />
                  - 該怎麼提升互動與成效
                </div>
              </div>

              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-sm font-semibold"
                >
                  立即升級 Pro（即將推出）
                </button>
                <p className="mt-2 text-center text-xs text-white/60">UI 預覽中｜現在不會扣款，可隨時關閉</p>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/70">
                  <span className="mr-2">🔒</span>
                  不綁卡｜不扣款｜之後接 Stripe 才會開放
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 px-6 py-6">
          <h2 className="text-lg font-semibold">常見問題</h2>
          <div className="mt-4 space-y-4 text-sm text-white/70">
            <p>
              <span className="font-semibold text-white/85">免費版會有什麼限制？</span>
              <br />
              只能看到摘要與 Top 內容；深度診斷、行動清單與下載報告需 Pro。
            </p>
            <p>
              <span className="font-semibold text-white/85">什麼時候適合升級？</span>
              <br />
              當你想把數據變成「可執行的成長行動」時。
            </p>
            <p>
              <span className="font-semibold text-white/85">為什麼現在不能付款？</span>
              <br />
              目前提供 UI 預覽；之後接 Stripe 即可開放訂閱。
            </p>
          </div>
        </section>

        <div className="mt-6 text-center text-xs text-white/45">© {new Date().getFullYear()} IG Analyzer · Pro 訂閱即將推出</div>
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
                  <div className="text-lg font-semibold">Pro 即將推出</div>
                  <div className="mt-1 text-sm text-white/70">留下 Email，我們會在 Pro 上線第一時間通知你</div>
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
                  已收到，我們會通知你
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
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/25"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-sm font-semibold"
                  >
                    通知我
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
