"use client"

import * as React from "react"
import { useEffect } from "react"

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  console.log("[ResultsLayout] mounted")

  useEffect(() => {
    // no-op
  }, [])

  return <>{children}</>
}
