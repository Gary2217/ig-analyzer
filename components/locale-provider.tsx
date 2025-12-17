"use client"

import React, { createContext, useContext, useMemo } from "react"
import type { Locale } from "../lib/i18n"

type Messages = Record<string, unknown>

type LocaleContextValue = {
  locale: Locale
  messages: Messages
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function getNested(messages: Messages, key: string): unknown {
  const parts = key.split(".")
  let cur: unknown = messages
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function tImpl(messages: Messages, key: string): string {
  const v = getNested(messages, key)
  if (typeof v === "string") return v
  return key
}

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Messages
  children: React.ReactNode
}) {
  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale,
      messages,
      t: (key: string) => tImpl(messages, key),
    }
  }, [locale, messages])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    return {
      locale: "en",
      messages: {},
      t: (key: string) => key,
    }
  }
  return ctx
}
