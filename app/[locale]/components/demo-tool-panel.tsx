"use client"

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
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
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
  )
}
