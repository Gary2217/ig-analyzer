"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Provider = "instagram" | "threads"

type Props = {
  activeLocale: string
  connectedProvider?: Provider
}

export default function DemoToolPanel({ activeLocale, connectedProvider }: Props) {
  const router = useRouter()
  const [provider, setProvider] = useState<Provider>("instagram")

  const isConnected = useMemo(() => {
    return !!connectedProvider && connectedProvider === provider
  }, [connectedProvider, provider])

  const oauthBase = `/api/auth/instagram?provider=${provider}`

  function goOAuth(next: string) {
    const url = `${oauthBase}&next=${encodeURIComponent(next)}`
    window.location.href = url
  }

  function onAnalyzeAccount() {
    if (!isConnected) {
      const next = `/${activeLocale}/results?connected=${provider}`
      goOAuth(next)
      return
    }
    router.push(`/${activeLocale}/results?connected=${provider}`)
  }

  function onAnalyzePost() {
    if (!isConnected) {
      const next = `/${activeLocale}/post-analysis?provider=${provider}`
      goOAuth(next)
      return
    }
    router.push(`/${activeLocale}/post-analysis?provider=${provider}`)
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-white/60">DEMO TOOL</div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Instagram 與 Threads 帳號分析器</h2>
          <p className="mt-2 text-sm text-white/70">示範用模擬工具：不會存取任何 Instagram / Threads 真實資料。</p>
        </div>

        <div className="text-xs text-white/60">
          {connectedProvider === "instagram"
            ? "已連結 Instagram"
            : connectedProvider === "threads"
            ? "已連結 Threads"
            : "未連結（點分析會先驗證）"}
        </div>
      </div>

      {/* provider tabs */}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setProvider("instagram")}
          className={[
            "rounded-xl border px-4 py-2 text-sm",
            provider === "instagram" ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-transparent text-white/70 hover:bg-white/5",
          ].join(" ")}
        >
          Instagram
        </button>
        <button
          type="button"
          onClick={() => setProvider("threads")}
          className={[
            "rounded-xl border px-4 py-2 text-sm",
            provider === "threads" ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-transparent text-white/70 hover:bg-white/5",
          ].join(" ")}
        >
          Threads
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAnalyzeAccount}
          className="rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white"
        >
          分析帳號（會先驗證 API）
        </button>
        <button
          type="button"
          onClick={onAnalyzePost}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
        >
          分析貼文
        </button>
      </div>

      {/* 已移除：首頁貼文連結輸入框。貼文連結一律在 /post-analysis 頁輸入 */}
    </section>
  )
}
