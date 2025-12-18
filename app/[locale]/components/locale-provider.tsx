"use client"

import React from "react"
import { LocaleProvider as BaseLocaleProvider } from "../../../components/locale-provider"

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  children: React.ReactNode
  locale: string
  messages: any
}) {
  return (
    <BaseLocaleProvider locale={locale as any} messages={messages}>
      {children}
    </BaseLocaleProvider>
  )
}
