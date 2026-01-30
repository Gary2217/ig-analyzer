"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

const LS_KEY = "matchmaking:favorites:v1"

function safeParseSet(value: string | null): Set<string> {
  if (!value) return new Set()
  try {
    const arr = JSON.parse(value)
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"))
  } catch {}
  return new Set()
}

export function useFavorites() {
  const [ids, setIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setIds(safeParseSet(localStorage.getItem(LS_KEY)))
  }, [])

  const persist = useCallback((next: Set<string>) => {
    setIds(new Set(next))
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)))
  }, [])

  const isFav = useCallback((id: string) => ids.has(id), [ids])

  const toggleFav = useCallback(
    (id: string) => {
      const next = new Set(ids)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
    },
    [ids, persist]
  )

  const clearAll = useCallback(() => persist(new Set()), [persist])

  return useMemo(
    () => ({
      favoriteIds: ids,
      isFav,
      toggleFav,
      clearAll,
      count: ids.size,
    }),
    [ids, isFav, toggleFav, clearAll]
  )
}
