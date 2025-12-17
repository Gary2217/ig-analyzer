"use client"

import React from "react"

export function LocaleProvider({
  children,
}: {
  children: React.ReactNode
  locale?: string
  messages?: any
}) {
  return <>{children}</>
}
