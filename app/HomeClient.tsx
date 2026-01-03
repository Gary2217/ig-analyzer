"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import DemoToolPanel from "./[locale]/components/demo-tool-panel"

export default function HomeClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeLocale = pathname.split("/")[1] || "en"

  const [checking, setChecking] = useState(true)
  const [isConnectedFromServer, setIsConnectedFromServer] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 8_000)
    let cancelled = false

    fetch("/api/auth/instagram/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return
        setIsConnectedFromServer(res.ok)
      })
      .catch(() => {
        if (cancelled) return
        setIsConnectedFromServer(false)
      })
      .finally(() => {
        window.clearTimeout(timeoutId)
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      controller.abort()
      try {
        setChecking(false)
      } catch {
        // ignore
      }
    }
  }, [searchParams])

  return (
    <main className="relative min-h-screen bg-[#0b1220] text-white px-6 py-14 flex items-center justify-center overflow-hidden">
      <div className="analytics-bg" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl">
        <DemoToolPanel
          activeLocale={activeLocale}
          isConnectedFromServer={isConnectedFromServer}
          checking={checking}
        />
      </div>
    </main>
  )
}
