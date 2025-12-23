"use client"

import * as React from "react"
import { useEffect, useState } from "react"

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  console.log("[ResultsLayout] mounted")

  const [mediaLoaded, setMediaLoaded] = useState(false)

  useEffect(() => {
    if (mediaLoaded) return

    console.log("[media] fetch (from ResultsLayout)")

    fetch("/api/instagram/media", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        setMediaLoaded(true)
      })
      .catch((err) => {
        console.error("[media] fetch failed", err)
      })
  }, [mediaLoaded])

  return <>{children}</>
}
