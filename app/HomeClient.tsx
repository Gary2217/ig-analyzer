"use client"

import { usePathname, useSearchParams } from "next/navigation"
import DemoToolPanel from "./[locale]/components/demo-tool-panel"

export default function HomeClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeLocale = pathname.split("/")[1] || "en"
  const connectedRaw = (searchParams.get("connected") || "").toLowerCase()
  const connectedProvider =
    connectedRaw === "instagram" || connectedRaw === "threads" ? connectedRaw : undefined

  return (
    <main className="relative min-h-screen bg-[#0b1220] text-white px-6 py-14 flex items-center justify-center overflow-hidden">
      <div className="analytics-bg" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl">
        <DemoToolPanel
          activeLocale={activeLocale}
          connectedProvider={connectedProvider}
        />
      </div>
    </main>
  )
}
