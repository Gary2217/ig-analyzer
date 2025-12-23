"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Camera, MessageCircle } from "lucide-react"

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
        <Button
          type="button"
          onClick={() => setProvider("instagram")}
          variant="pill"
          size="pill"
          active={provider === "instagram"}
          platform="instagram"
          className={
            provider === "instagram"
              ? "bg-black/60 text-white border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-black/65"
              : "bg-black/25 text-white/60 border border-white/10 hover:bg-black/30"
          }
        >
          <Camera className="h-4 w-4 opacity-80" />
          Instagram
        </Button>
        <Button
          type="button"
          onClick={() => setProvider("threads")}
          variant="pill"
          size="pill"
          active={provider === "threads"}
          platform="threads"
          className={
            provider === "threads"
              ? "bg-black/60 text-white border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-black/65"
              : "bg-black/25 text-white/60 border border-white/10 hover:bg-black/30"
          }
        >
          <MessageCircle className="h-4 w-4 opacity-80" />
          Threads
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          onClick={onAnalyzeAccount}
          variant="primary"
          size="lg-cta"
        >
          分析帳號
        </Button>
        <Button
          type="button"
          onClick={onAnalyzePost}
          variant="secondary"
          size="lg-cta"
        >
          分析貼文
        </Button>
      </div>

      {/* 已移除：首頁貼文連結輸入框。貼文連結一律在 /post-analysis 頁輸入 */}
    </section>
  )
}
