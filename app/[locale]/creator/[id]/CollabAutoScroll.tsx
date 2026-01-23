"use client"

import { useEffect } from "react"

interface CollabAutoScrollProps {
  tab?: string
}

export function CollabAutoScroll({ tab }: CollabAutoScrollProps) {
  useEffect(() => {
    if (tab === "collab") {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const collabSection = document.getElementById("collab")
        if (collabSection) {
          collabSection.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      })
    }
  }, [tab])

  return null
}
