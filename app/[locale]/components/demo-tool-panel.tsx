"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuthNavigation } from "@/app/lib/useAuthNavigation"

type Provider = "instagram" | "threads"

type Props = {
  activeLocale: string
  isConnectedFromServer: boolean
  checking: boolean
}

export default function DemoToolPanel({ activeLocale, isConnectedFromServer, checking }: Props) {
  void isConnectedFromServer

  // Derive locale from pathname (source of truth for client-side rendering)
  const pathname = usePathname()
  const locale = pathname?.startsWith("/zh-TW") ? "zh-TW" : "en"
  const { navigateToResults, navigateToPostAnalysis, loading: authLoading } = useAuthNavigation()

  function onAnalyzeAccount() {
    if (checking || authLoading) return
    navigateToResults()
  }

  function onAnalyzePost() {
    if (checking || authLoading) return
    navigateToPostAnalysis()
  }

  return (
    <>
      {/* Instagram Creator Directory Card - NEW (appears first) */}
      <section className="w-full max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold tracking-widest text-white/60">
                {locale === "zh-TW" ? "新功能" : "NEW"}
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-200 border border-emerald-400/20 shrink-0">
                NEW
              </span>
            </div>
            <div className="mt-3 min-w-0">
              <h2 className="text-3xl font-bold tracking-tight min-w-0 truncate leading-tight">
                {locale === "zh-TW" ? "快速找到合作對象" : "Instagram Creator Directory"}
              </h2>
              <p className="mt-3 text-base text-white/70 leading-relaxed max-w-[60ch] whitespace-pre-line break-words">
                {locale === "zh-TW"
                  ? "Instagram 創作者資料庫\n瀏覽 Instagram 創作者名片"
                  : "Browse Instagram creator profiles\nFind collaboration partners"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Link href={`/${locale}/matchmaking`}>
            <Button
              type="button"
              variant="primary"
              size="lg-cta"
              className="w-full sm:w-auto bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10"
            >
              {locale === "zh-TW" ? "瀏覽 Instagram 創作者名片" : "Browse Instagram Creator Profiles"}
            </Button>
          </Link>
        </div>
      </section>

      {/* Instagram Creator Analysis Tool */}
      <section className="w-full max-w-3xl mx-auto mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-widest text-white/60">DEMO TOOL</div>
            <div className="mt-2 min-w-0">
              <h2 className="text-2xl font-bold tracking-tight min-w-0 truncate leading-tight">
                {locale === "zh-TW" ? "分析我的 Instagram 帳號" : "Instagram Creator Analysis"}
              </h2>
              <p className="mt-2 text-sm text-white/70 leading-relaxed max-w-[60ch] whitespace-pre-line break-words">
                {locale === "zh-TW" ? "查看數據並編輯對外公開名片" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* provider tabs */}
        {/* Platform pills removed (Instagram / Threads) */}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={onAnalyzeAccount}
            variant="primary"
            size="lg-cta"
            disabled={!!checking}
            aria-busy={checking ? true : undefined}
          >
            {locale === "zh-TW" ? "分析帳號" : "Analyze Account"}
          </Button>
          <Button
            type="button"
            onClick={onAnalyzePost}
            variant="secondary"
            size="lg-cta"
            disabled={!!checking}
            aria-busy={checking ? true : undefined}
          >
            {locale === "zh-TW" ? "分析貼文" : "Analyze Post"}
          </Button>
        </div>

        {/* 已移除：首頁貼文連結輸入框。貼文連結一律在 /post-analysis 頁輸入 */}
      </section>
    </>
  )
}
