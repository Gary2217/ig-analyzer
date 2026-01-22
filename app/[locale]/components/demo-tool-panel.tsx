"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

type Provider = "instagram" | "threads"

type Props = {
  activeLocale: string
  isConnectedFromServer: boolean
  checking: boolean
}

export default function DemoToolPanel({ activeLocale, isConnectedFromServer, checking }: Props) {
  void isConnectedFromServer

  // NOTE: Threads is not supported (API not complete). Lock provider to Instagram only.
  const provider: Provider = "instagram"

  const oauthBase = `/api/auth/instagram?provider=${provider}`

  function goOAuth(next: string) {
    const url = `${oauthBase}&next=${encodeURIComponent(next)}`
    window.location.href = url
  }

  function onAnalyzeAccount() {
    if (checking) return
    const next = `/${activeLocale}/results`
    goOAuth(next)
  }

  function onAnalyzePost() {
    if (checking) return
    const next = `/${activeLocale}/post-analysis`
    goOAuth(next)
  }

  return (
    <>
      <section className="w-full max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-widest text-white/60">DEMO TOOL</div>
            <div className="mt-2 flex items-start justify-between gap-3 min-w-0">
              <h2 className="text-2xl font-bold tracking-tight min-w-0 truncate leading-tight">Instagram 帳號分析器</h2>
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
            分析帳號
          </Button>
          <Button
            type="button"
            onClick={onAnalyzePost}
            variant="secondary"
            size="lg-cta"
            disabled={!!checking}
            aria-busy={checking ? true : undefined}
          >
            分析貼文
          </Button>
        </div>

        {/* 已移除：首頁貼文連結輸入框。貼文連結一律在 /post-analysis 頁輸入 */}
      </section>

      {/* Matchmaking Platform Card */}
      <section className="w-full max-w-3xl mx-auto mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold tracking-widest text-white/60">
                {activeLocale === "zh-TW" ? "新功能" : "NEW"}
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-200 border border-emerald-400/20 shrink-0">
                NEW
              </span>
            </div>
            <div className="mt-2 min-w-0">
              <h2 className="text-2xl font-bold tracking-tight min-w-0 truncate leading-tight">
                {activeLocale === "zh-TW" ? "Instagram 創作者資料庫" : "Instagram Creator Directory"}
              </h2>
              <p className="mt-2 text-sm text-white/70 leading-relaxed max-w-[60ch]">
                {activeLocale === "zh-TW"
                  ? "瀏覽 Instagram 創作者名片\n快速找到合作對象"
                  : "Browse Instagram creator profiles\nFind collaboration partners"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Link href={`/${activeLocale}/matchmaking`}>
            <Button
              type="button"
              className="w-full sm:w-auto h-11 px-6 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10"
            >
              {activeLocale === "zh-TW" ? "前往媒合平台" : "Open Matchmaking"}
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
