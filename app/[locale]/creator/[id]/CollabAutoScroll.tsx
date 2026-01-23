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
          
          // Auto-focus the first input after scroll completes
          setTimeout(() => {
            const input = document.querySelector("#collab input[data-collab-first='1']") as HTMLInputElement | null
            if (input) {
              input.focus()
            }
          }, 500) // Wait for smooth scroll to complete
        }
      })
    }
  }, [tab])

  return null
}
