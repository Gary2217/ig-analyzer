"use client"

import type { ReactNode } from "react"

export function CreatorGrid({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">{children}</div>
    </div>
  )
}
