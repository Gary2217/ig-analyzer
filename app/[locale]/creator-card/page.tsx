"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { Pencil, Plus, X } from "lucide-react"
import { createPortal } from "react-dom"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useI18n } from "../../../components/locale-provider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { extractLocaleFromPathname, localePathname } from "../../lib/locale-path"
import { CreatorCardPreview } from "../../components/CreatorCardPreview"
import { useInstagramMe } from "../../lib/useInstagramMe"
import { COLLAB_TYPE_OPTIONS, COLLAB_TYPE_OTHER_VALUE, collabTypeLabelKey } from "../../lib/creatorCardOptions"

type CreatorStats = {
  engagementRatePct?: number
}

type InstagramProfileLite = {
  username?: string
  name?: string
  display_name?: string
  displayName?: string
  profile_picture_url?: string
  followers_count?: number
  media_count?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

type CreatorCardMeResponse = {
  ok: boolean
  card?: unknown
  me?: unknown
  error?: unknown
}

type CreatorStatsResponse = {
  ok: boolean
  stats?: unknown
}

type CreatorCardUpsertResponse = {
  ok: boolean
  error?: unknown
  message?: unknown
}

type CreatorCardPortfolioItem = {
  id: string
  brand: string
  collabType: string
  order: number
}

type CreatorCardUpsertPayload = {
  handle?: string
  displayName?: string
  niche?: string
  audience?: string
  themeTypes?: string[]
  audienceProfiles?: string[]
  contact?: string | null
  portfolio?: CreatorCardPortfolioItem[]
  isPublic?: boolean
  deliverables?: string[]
  collaborationNiches?: string[]
  pastCollaborations?: string[]
}

type CreatorCardPayload = {
  handle?: string | null
  displayName?: string | null
  niche?: string | null
  audience?: string | null
  themeTypes?: string[] | null
  audienceProfiles?: string[] | null
  deliverables?: string[] | null
  contact?: string | null
  portfolio?: unknown[] | null
  isPublic?: boolean | null
  collaborationNiches?: string[] | null
  pastCollaborations?: string[] | null
}

type FeaturedItem = {
  id: string
  url: string
  brand: string
  collabType: string
}

function SortableFeaturedTile(props: {
  item: FeaturedItem
  onReplace: (id: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
  suppressClick: boolean
}) {
  const { item, onReplace, onRemove, onEdit, suppressClick } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "group relative w-full aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow " +
        (isDragging ? "scale-[1.03] shadow-lg ring-2 ring-slate-950/10" : "hover:border-slate-300") +
        (isDragging ? " cursor-grabbing" : " cursor-grab")
      }
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className={
          "absolute inset-0 z-0 " +
          (!item.url
            ? "flex flex-col items-center justify-center gap-1 text-slate-600"
            : "")
        }
        onClick={() => {
          if (suppressClick) return
          onReplace(item.id)
        }}
        aria-label={item.url ? "更換" : "請選擇"}
      >
        {!item.url ? (
          <span className="pointer-events-none flex flex-col items-center justify-center">
            <span className="text-sm font-semibold">請選擇</span>
            <span className="text-[11px] leading-4 text-slate-500">Choose</span>
          </span>
        ) : null}
      </button>

      {item.url ? (
        <img src={item.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-slate-50">
          <Plus className="h-7 w-7 text-slate-300" />
        </div>
      )}

      {item.url ? (
        <button
          type="button"
          className="absolute left-1 top-1 z-10 rounded-md bg-white/90 px-2 py-1 shadow-sm hover:bg-white"
          aria-label="請選擇"
          onPointerDownCapture={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onEdit(item.id)
          }}
        >
          <span className="text-[11px] font-semibold text-slate-700">請選擇</span>
        </button>
      ) : null}

      <button
        type="button"
        className="absolute right-1 top-1 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
        onPointerDownCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(item.id)
        }}
        aria-label="移除"
      >
        <X className="h-3.5 w-3.5 text-slate-700" />
      </button>
    </div>
  )
}

function normalizeStringArray(value: unknown, maxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

function toggleInArray(values: string[], value: string) {
  const idx = values.indexOf(value)
  if (idx >= 0) return [...values.slice(0, idx), ...values.slice(idx + 1)]
  return [...values, value]
}

export default function CreatorCardPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const knownFormatIds = useMemo(
    () =>
      new Set([...COLLAB_TYPE_OPTIONS, "fb", "facebook", "other"]),
    [],
  )

  const knownCollabTypeIds = useMemo(() => new Set<string>(COLLAB_TYPE_OPTIONS as unknown as string[]), [])

  const [refetchTick, setRefetchTick] = useState(0)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null)

  const activeLocale = useMemo(() => {
    if (typeof window === "undefined") return "en"
    return extractLocaleFromPathname(window.location.pathname).locale ?? "en"
  }, [])

  const formatOptions = useMemo(
    () =>
      ([
        ...COLLAB_TYPE_OPTIONS.map((id) => ({ id, labelKey: collabTypeLabelKey(id) })),
        { id: "other", labelKey: "creatorCardEditor.formats.options.other" },
      ] as const),
    []
  )

  const nicheOptions = useMemo(
    () =>
      [
        { id: "beauty", labelKey: "creatorCardEditor.niches.options.beauty" },
        { id: "fashion", labelKey: "creatorCardEditor.niches.options.fashion" },
        { id: "food", labelKey: "creatorCardEditor.niches.options.food" },
        { id: "travel", labelKey: "creatorCardEditor.niches.options.travel" },
        { id: "parenting", labelKey: "creatorCardEditor.niches.options.parenting" },
        { id: "fitness", labelKey: "creatorCardEditor.niches.options.fitness" },
        { id: "tech", labelKey: "creatorCardEditor.niches.options.tech" },
        { id: "finance", labelKey: "creatorCardEditor.niches.options.finance" },
        { id: "education", labelKey: "creatorCardEditor.niches.options.education" },
        { id: "gaming", labelKey: "creatorCardEditor.niches.options.gaming" },
        { id: "lifestyle", labelKey: "creatorCardEditor.niches.options.lifestyle" },
        { id: "pets", labelKey: "creatorCardEditor.niches.options.pets" },
        { id: "home", labelKey: "creatorCardEditor.niches.options.home" },
        { id: "ecommerce", labelKey: "creatorCardEditor.niches.options.ecommerce" },
      ] as const,
    []
  )

  const knownNicheIds = useMemo<Set<string>>(() => new Set(nicheOptions.map((x) => x.id as string)), [nicheOptions])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveInFlightRef = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadErrorKind, setLoadErrorKind] = useState<
    "not_connected" | "supabase_invalid_key" | "load_failed" | null
  >(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [showNewCardHint, setShowNewCardHint] = useState(false)

  const isDirtyRef = useRef(false)

  const markDirty = useCallback(() => {
    isDirtyRef.current = true
  }, [])

  const clearDirty = useCallback(() => {
    isDirtyRef.current = false
  }, [])

  const confirmLeaveIfDirty = useCallback(() => {
    if (!isDirtyRef.current) return true
    const zh = "你有尚未儲存的變更，確定要離開嗎？"
    const en = "You have unsaved changes. Leave without saving?"
    return window.confirm(`${zh}\n${en}`)
  }, [])

  const [introDraft, setIntroDraft] = useState("")
  const [introAppliedHint, setIntroAppliedHint] = useState(false)
  const introAppliedHintTimerRef = useRef<number | null>(null)

  const meQuery = useInstagramMe({ enabled: true })

  const [baseCard, setBaseCard] = useState<CreatorCardPayload | null>(null)
  const [deliverables, setDeliverables] = useState<string[]>([])
  const [collaborationNiches, setCollaborationNiches] = useState<string[]>([])
  const [pastCollaborations, setPastCollaborations] = useState<string[]>([])
  const [themeTypes, setThemeTypes] = useState<string[]>([])
  const [audienceProfiles, setAudienceProfiles] = useState<string[]>([])

  const [primaryTypeTags, setPrimaryTypeTags] = useState<string[]>([])

  const [contactEmail, setContactEmail] = useState("")
  const [contactInstagram, setContactInstagram] = useState("")
  const [contactOther, setContactOther] = useState("")

  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([])
  const featuredItemsRef = useRef<FeaturedItem[]>([])
  const featuredAddInputRef = useRef<HTMLInputElement | null>(null)
  const featuredReplaceInputRef = useRef<HTMLInputElement | null>(null)
  const pendingFeaturedReplaceIdRef = useRef<string | null>(null)
  const [suppressFeaturedTileClick, setSuppressFeaturedTileClick] = useState(false)
  const [editingFeaturedId, setEditingFeaturedId] = useState<string | null>(null)
  const [editingFeaturedBrand, setEditingFeaturedBrand] = useState("")
  const [editingFeaturedCollabTypeSelect, setEditingFeaturedCollabTypeSelect] = useState("")
  const [editingFeaturedCollabTypeCustom, setEditingFeaturedCollabTypeCustom] = useState("")

  const [__overlayMounted, set__overlayMounted] = useState(false)
  useEffect(() => {
    set__overlayMounted(true)
  }, [])

  const openAddFeatured = useCallback(() => {
    featuredAddInputRef.current?.click()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const openEditFeatured = useCallback(
    (id: string) => {
      setFeaturedItems((prev) => {
        const picked = prev.find((x) => x.id === id)
        setEditingFeaturedId(id)
        setEditingFeaturedBrand(typeof picked?.brand === "string" ? picked.brand : "")
        const current = typeof picked?.collabType === "string" ? picked.collabType : ""
        const presetLabels = COLLAB_TYPE_OPTIONS.map((optId) => t(collabTypeLabelKey(optId)))
        if (current && presetLabels.includes(current)) {
          setEditingFeaturedCollabTypeSelect(current)
          setEditingFeaturedCollabTypeCustom("")
        } else if (current) {
          setEditingFeaturedCollabTypeSelect(COLLAB_TYPE_OTHER_VALUE)
          setEditingFeaturedCollabTypeCustom(current)
        } else {
          setEditingFeaturedCollabTypeSelect("")
          setEditingFeaturedCollabTypeCustom("")
        }
        return prev
      })
    },
    [setFeaturedItems, t]
  )

  const serializedContact = useMemo(() => {
    const email = contactEmail.trim()
    const instagram = contactInstagram.trim()
    const other = contactOther.trim()
    if (!email && !instagram && !other) return null
    return JSON.stringify({ email, instagram, other })
  }, [contactEmail, contactInstagram, contactOther])

  const [otherFormatEnabled, setOtherFormatEnabled] = useState(false)
  const [otherFormatInput, setOtherFormatInput] = useState("")

  const [otherNicheEnabled, setOtherNicheEnabled] = useState(false)
  const [otherNicheInput, setOtherNicheInput] = useState("")

  const [primaryTypeInput, setPrimaryTypeInput] = useState("")

  const [themeTypeInput, setThemeTypeInput] = useState("")
  const [audienceProfileInput, setAudienceProfileInput] = useState("")

  const [brandInput, setBrandInput] = useState("")
  const brandInputRef = useRef<HTMLInputElement | null>(null)

  const [highlight, setHighlight] = useState<"formats" | "niches" | "brands" | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const flashHighlight = useCallback((key: "formats" | "niches" | "brands") => {
    setHighlight(key)
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current)
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlight(null)
      highlightTimerRef.current = null
    }, 1200)
  }, [])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }

      if (introAppliedHintTimerRef.current != null) {
        window.clearTimeout(introAppliedHintTimerRef.current)
        introAppliedHintTimerRef.current = null
      }
    }
  }, [])

  const addBrandTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setPastCollaborations((prev) => normalizeStringArray([...prev, next[0]], 20))
      flashHighlight("brands")
    },
    [flashHighlight, setPastCollaborations]
  )

  const addThemeTypeTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setThemeTypes((prev) => normalizeStringArray([...prev, next[0]], 20))
    },
    [setThemeTypes]
  )

  const addAudienceProfileTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setAudienceProfiles((prev) => normalizeStringArray([...prev, next[0]], 20))
    },
    [setAudienceProfiles]
  )

  const addPrimaryTypeTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setPrimaryTypeTags((prev) => normalizeStringArray([...prev, next[0]], 6))
    },
    [setPrimaryTypeTags]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      setLoadErrorKind(null)
      setSaveOk(false)
      setShowNewCardHint(false)
      try {
        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })

        const jsonRaw: unknown = await res.json().catch(() => null)
        const json = (asRecord(jsonRaw) as unknown as CreatorCardMeResponse) ?? null
        if (cancelled) return

        if (!res.ok || !json?.ok) {
          if (res.status === 401) {
            setLoadErrorKind("not_connected")
            setLoadError(t("creatorCardEditor.errors.notConnected"))
            return
          }

          if (res.status === 500 && json?.error === "supabase_invalid_key") {
            setLoadErrorKind("supabase_invalid_key")
            setLoadError(null)
            return
          }

          setLoadErrorKind("load_failed")
          setLoadError(t("creatorCardEditor.errors.loadFailed"))
          return
        }

        const card = asRecord(json?.card) ?? null

        const meObj = asRecord(json?.me)
        const nextCreatorIdRaw = meObj ? readString(meObj.igUserId) : null
        const nextCreatorId = nextCreatorIdRaw ? String(nextCreatorIdRaw).trim() : ""
        setCreatorId(nextCreatorId || null)

        const nextBase: CreatorCardPayload | null = card
          ? {
              handle: readString(card?.handle) ?? null,
              displayName: readString(card?.display_name) ?? null,
              niche: readString(card?.niche) ?? null,
              audience: readString(card?.audience) ?? null,
              themeTypes: Array.isArray(card?.themeTypes)
                ? (card?.themeTypes as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.theme_types)
                  ? (card?.theme_types as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              audienceProfiles: Array.isArray(card?.audienceProfiles)
                ? (card?.audienceProfiles as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.audience_profiles)
                  ? (card?.audience_profiles as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              deliverables: Array.isArray(card?.deliverables)
                ? (card?.deliverables as unknown[]).filter((x): x is string => typeof x === "string")
                : null,
              contact: readString(card?.contact) ?? null,
              portfolio: Array.isArray(card?.portfolio) ? (card?.portfolio as unknown[]) : null,
              isPublic: typeof card?.is_public === "boolean" ? (card.is_public as boolean) : null,
              collaborationNiches: Array.isArray(card?.collaborationNiches)
                ? (card?.collaborationNiches as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.collaboration_niches)
                  ? (card?.collaboration_niches as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
              pastCollaborations: Array.isArray(card?.pastCollaborations)
                ? (card?.pastCollaborations as unknown[]).filter((x): x is string => typeof x === "string")
                : Array.isArray(card?.past_collaborations)
                  ? (card?.past_collaborations as unknown[]).filter((x): x is string => typeof x === "string")
                  : null,
            }
          : null

        setBaseCard(nextBase)
        setIntroDraft(typeof nextBase?.audience === "string" ? nextBase.audience : "")
        const nextDeliverables = normalizeStringArray(nextBase?.deliverables ?? [], 50)
        setDeliverables(nextDeliverables)
        setCollaborationNiches(normalizeStringArray(nextBase?.collaborationNiches ?? [], 20))
        setPastCollaborations(normalizeStringArray(nextBase?.pastCollaborations ?? [], 20))
        setThemeTypes(normalizeStringArray(nextBase?.themeTypes ?? [], 20))
        setAudienceProfiles(normalizeStringArray(nextBase?.audienceProfiles ?? [], 20))

        const parsedContact = (() => {
          const raw = typeof nextBase?.contact === "string" ? nextBase.contact.trim() : ""
          if (!raw) return { email: "", instagram: "", other: "" }
          try {
            const obj = asRecord(JSON.parse(raw) as unknown)
            return {
              email: readString(obj?.email) ?? "",
              instagram: readString(obj?.instagram) ?? "",
              other: readString(obj?.other) ?? "",
            }
          } catch {
            return { email: "", instagram: "", other: raw }
          }
        })()
        setContactEmail(parsedContact.email)
        setContactInstagram(parsedContact.instagram)
        setContactOther(parsedContact.other)

        const nextFeaturedItems = (() => {
          const raw = Array.isArray(card?.portfolio) ? (card?.portfolio as unknown[]) : []
          const out: FeaturedItem[] = []
          for (let i = 0; i < raw.length; i++) {
            const it = raw[i]
            if (!it || typeof it !== "object") continue
            const itObj = asRecord(it)
            const idRaw = itObj ? (readString(itObj.id) ?? "").trim() : ""
            out.push({
              id: idRaw || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              url: "",
              brand: itObj ? (readString(itObj.brand) ?? "") : "",
              collabType: itObj ? (readString(itObj.collabType) ?? "") : "",
            })
          }
          return out
        })()

        setFeaturedItems((prev) => {
          for (const item of prev) {
            if (typeof item.url === "string" && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
          }
          return nextFeaturedItems
        })

        const primaryParts = (() => {
          const raw = typeof nextBase?.niche === "string" ? nextBase.niche : ""
          if (!raw.trim()) return []
          return raw
            .split(/[,、·|]/g)
            .map((x) => x.trim())
            .filter(Boolean)
        })()
        setPrimaryTypeTags(normalizeStringArray(primaryParts, 6))

        const customs = nextDeliverables.filter((x) => !knownFormatIds.has(x))
        setOtherFormatEnabled(customs.length > 0)
        setOtherFormatInput("")

        const nicheCustoms = normalizeStringArray(nextBase?.collaborationNiches ?? [], 20).filter((x) => !knownNicheIds.has(x))
        setOtherNicheEnabled(nicheCustoms.length > 0)
        setOtherNicheInput("")

        const isLikelyEmpty = (() => {
          const hasAnyText =
            Boolean(nextBase?.displayName && String(nextBase.displayName).trim()) ||
            Boolean(nextBase?.niche && String(nextBase.niche).trim()) ||
            Boolean(nextBase?.audience && String(nextBase.audience).trim()) ||
            Boolean(nextBase?.contact && String(nextBase.contact).trim())
          const hasAnyLists =
            normalizeStringArray(nextBase?.deliverables ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.collaborationNiches ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.pastCollaborations ?? [], 1).length > 0
          return !hasAnyText && !hasAnyLists
        })()

        setShowNewCardHint(isLikelyEmpty)
      } catch {
        if (cancelled) return
        setLoadErrorKind("load_failed")
        setLoadError(t("creatorCardEditor.errors.loadFailed"))
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refetchTick, t])

  useEffect(() => {
    setBaseCard((prev) => {
      const nextContact = serializedContact
      if ((prev?.contact ?? null) === nextContact) return prev
      return { ...(prev ?? {}), contact: nextContact }
    })
  }, [serializedContact])

  useEffect(() => {
    return () => {
      for (const item of featuredItemsRef.current) {
        if (typeof item.url === "string" && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
      }
    }
  }, [])

  useEffect(() => {
    featuredItemsRef.current = featuredItems
  }, [featuredItems])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  useEffect(() => {
    history.pushState(null, "", location.href)

    const onPopState = () => {
      if (!isDirtyRef.current) return
      const ok = confirmLeaveIfDirty()
      if (ok) return
      history.pushState(null, "", location.href)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [confirmLeaveIfDirty])

  useEffect(() => {
    if (!creatorId) {
      setCreatorStats(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/stats`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const jsonRaw: unknown = await res.json().catch(() => null)
        const json = (asRecord(jsonRaw) as unknown as CreatorStatsResponse) ?? null
        if (cancelled) return
        if (!res.ok || !json?.ok) {
          setCreatorStats(null)
          return
        }
        const statsObj = asRecord(json?.stats)
        const engagementRatePct = statsObj ? readNumber(statsObj.engagementRatePct) : null
        setCreatorStats(engagementRatePct == null ? null : { engagementRatePct })
      } catch {
        if (cancelled) return
        setCreatorStats(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [creatorId])

  const handleRetryLoad = useCallback(() => {
    setRefetchTick((x) => x + 1)
  }, [])

  const addOtherFormat = useCallback(() => {
    const trimmed = otherFormatInput.trim()
    if (!trimmed) return
    setPastCollaborations((prev) => {
      const lower = trimmed.toLowerCase()
      const hasDup = prev.some((x) => x.toLowerCase() === lower)
      if (hasDup) return prev
      return [...prev, trimmed]
    })
    setOtherFormatInput("")
    flashHighlight("formats")
  }, [flashHighlight, otherFormatInput])

  const addOtherNiche = useCallback(() => {
    const trimmed = otherNicheInput.trim()
    if (!trimmed) return
    setCollaborationNiches((prev) => {
      const lower = trimmed.toLowerCase()
      const hasDup = prev.some((x) => x.toLowerCase() === lower)
      if (hasDup) return prev
      return [...prev, trimmed]
    })
    setOtherNicheInput("")
    flashHighlight("niches")
  }, [flashHighlight, otherNicheInput])

  useEffect(() => {
    setBaseCard((prev) => {
      if (!prev) return prev
      const joined = primaryTypeTags.length > 0 ? primaryTypeTags.join(activeLocale === "zh-TW" ? "、" : ", ") : null
      if ((prev.niche ?? null) === joined) return prev
      return { ...prev, niche: joined }
    })
  }, [activeLocale, primaryTypeTags])

  const handleSave = useCallback(async () => {
    if (saving) return
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const payload: CreatorCardUpsertPayload = {
        handle: baseCard?.handle ?? undefined,
        displayName: baseCard?.displayName ?? undefined,
        niche: baseCard?.niche ?? undefined,
        audience: baseCard?.audience ?? undefined,
        themeTypes: normalizeStringArray(themeTypes, 20),
        audienceProfiles: normalizeStringArray(audienceProfiles, 20),
        contact: serializedContact,
        portfolio: featuredItems.map((x, idx) => ({
          id: x.id,
          brand: typeof x.brand === "string" ? x.brand : "",
          collabType: typeof x.collabType === "string" ? x.collabType : "",
          order: idx,
        })),
        isPublic: baseCard?.isPublic ?? undefined,
        deliverables: normalizeStringArray(deliverables, 50),
        collaborationNiches: normalizeStringArray(collaborationNiches, 20),
        pastCollaborations: normalizeStringArray(pastCollaborations, 20),
      }

      const url = "/api/creator-card/upsert"
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const jsonRaw: unknown = await res.clone().json().catch(() => null)
      const json = (asRecord(jsonRaw) as unknown as CreatorCardUpsertResponse) ?? null
      const text = json ? null : await res.text().catch(() => null)

      console.debug("[creator-card] save", {
        url,
        status: res.status,
        ok: res.ok,
        error: typeof json?.error === "string" ? json.error : null,
        message: typeof json?.message === "string" ? json.message : null,
        text: typeof text === "string" ? text.slice(0, 400) : null,
      })

      if (!res.ok || !json?.ok) {
        if (res.status === 401) {
          setSaveError("未登入或登入已過期 / Not authenticated (session expired)")
          return
        }

        if (res.status === 403 && json?.error === "not_connected") {
          setSaveError("尚未連結 IG 或連結已失效，請重新連結 / IG not connected or expired, please reconnect")
          return
        }

        const serverMsg =
          typeof json?.error === "string"
            ? json.error
            : typeof json?.message === "string"
              ? json.message
              : typeof text === "string" && text.trim()
                ? text.trim()
                : null

        setSaveError(serverMsg ? `${t("creatorCardEditor.errors.saveFailed")}: ${serverMsg}` : t("creatorCardEditor.errors.saveFailed"))
        return
      }

      setSaveOk(true)

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("creatorCard:updated", "1")
      }

      clearDirty()
    } catch {
      setSaveError(t("creatorCardEditor.errors.saveFailed"))
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }, [audienceProfiles, baseCard, collaborationNiches, deliverables, featuredItems, pastCollaborations, saving, serializedContact, t, themeTypes])

  const returnTo = useMemo(() => {
    const raw = (searchParams?.get("returnTo") ?? "").trim()
    if (raw) return raw
    return `/${activeLocale}/results#creator-card`
  }, [activeLocale, searchParams])

  const handleBack = useCallback(() => {
    if (!confirmLeaveIfDirty()) return
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push(returnTo)
  }, [confirmLeaveIfDirty, returnTo, router])

  const brandHelperText = useMemo(() => {
    const max = 20
    return t("creatorCardEditor.pastCollaborations.helper").replace("{count}", String(pastCollaborations.length)).replace("{max}", String(max))
  }, [pastCollaborations.length, t])

  const igMe = meQuery.data as unknown
  const igMeObj = asRecord(igMe)
  const igProfile = (asRecord(igMeObj?.profile) ?? igMeObj) as unknown as InstagramProfileLite

  const displayUsername = useMemo(() => {
    const raw = typeof igProfile?.username === "string" ? String(igProfile.username).trim() : ""
    return raw
  }, [igProfile?.username])

  const displayName = useMemo(() => {
    const raw = (igProfile?.name ?? igProfile?.display_name ?? igProfile?.displayName) as unknown
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    return displayUsername ? displayUsername : "—"
  }, [displayUsername, igProfile?.displayName, igProfile?.display_name, igProfile?.name])

  const finiteNumOrNull = useCallback((v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }, [])

  const formatNum = useCallback((n: number | null) => (n === null ? "—" : n.toLocaleString()), [])

  const followersText = useMemo(() => {
    const followers = finiteNumOrNull(igProfile?.followers_count)
    return typeof followers === "number" && Number.isFinite(followers) ? formatNum(followers) : null
  }, [finiteNumOrNull, formatNum, igProfile?.followers_count])

  const postsText = useMemo(() => {
    const posts = finiteNumOrNull(igProfile?.media_count)
    return typeof posts === "number" && Number.isFinite(posts) ? formatNum(posts) : null
  }, [finiteNumOrNull, formatNum, igProfile?.media_count])

  const engagementRateText = useMemo(() => {
    const pct = typeof creatorStats?.engagementRatePct === "number" ? creatorStats.engagementRatePct : null
    return typeof pct === "number" && Number.isFinite(pct) ? `${pct.toFixed(2)}%` : null
  }, [creatorStats?.engagementRatePct])

  const loadingSkeleton = (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0 animate-pulse">
      <div className="lg:col-span-5 space-y-4 min-w-0">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white">
            <div className="p-6">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((__, j) => (
                  <div key={j} className="h-9 w-24 rounded-full bg-slate-100" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-7 min-w-0">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-6">
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
            <div className="mt-6 h-72 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold min-w-0 truncate">{t("creatorCardEditor.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 min-w-0">{t("creatorCardEditor.subtitle")}</p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Button variant="outline" onClick={handleBack} disabled={saving}>
            {t("creatorCardEditor.actions.back")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || loading || loadErrorKind === "not_connected" || loadErrorKind === "supabase_invalid_key"}
          >
            {saving ? t("creatorCardEditor.actions.saving") : t("creatorCardEditor.actions.save")}
          </Button>
        </div>
      </div>

      {loadErrorKind === "supabase_invalid_key" ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-semibold">{t("creatorCardEditor.errors.supabaseInvalidKey.title")}</div>
          <div className="mt-1 text-amber-100/80">{t("creatorCardEditor.errors.supabaseInvalidKey.body")}</div>
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="min-w-0 break-words [overflow-wrap:anywhere]">{loadError}</div>
          {loadErrorKind === "load_failed" ? (
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={handleRetryLoad} disabled={loading || saving}>
                {t("creatorCardEditor.actions.retry")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {saveError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>
      ) : null}
      {saveOk ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{t("creatorCardEditor.success.saved")}</div>
      ) : null}

      {showNewCardHint && !loading && !loadErrorKind ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">{t("creatorCardEditor.empty.title")}</div>
          <div className="mt-1 text-slate-600 min-w-0 break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.empty.body")}</div>
        </div>
      ) : null}

      {loading ? (
        loadingSkeleton
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
          <div className="lg:col-span-5 min-w-0" onChangeCapture={markDirty} onInputCapture={markDirty}>
            {(() => {
              type LocalMobileSectionKey =
                | "profile"
                | "contact"
                | "featured"
                | "formats"
                | "niches"
                | "brands"
                | "past"

              const sections: Array<{
                key: LocalMobileSectionKey
                titleZh: string
                titleEn: string
                render: () => ReactNode
              }> = [
                {
                  key: "profile",
                  titleZh: "基本資料",
                  titleEn: "Basic Info",
                  render: () => (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{t("creatorCardEditor.profile.bioTitle")}</div>
                        <div className="mt-2 relative">
                          <textarea
                            value={introDraft}
                            placeholder={t("creatorCardEditor.profile.bioPlaceholder")}
                            onChange={(e) => setIntroDraft(e.target.value)}
                            className="w-full min-h-[96px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 pr-24 pb-12 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/20"
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="absolute bottom-3 right-3"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setBaseCard((prev) => ({ ...(prev ?? {}), audience: introDraft }))
                              setIntroAppliedHint(true)
                              if (introAppliedHintTimerRef.current != null) window.clearTimeout(introAppliedHintTimerRef.current)
                              introAppliedHintTimerRef.current = window.setTimeout(() => {
                                setIntroAppliedHint(false)
                                introAppliedHintTimerRef.current = null
                              }, 1600)
                            }}
                            disabled={
                              saving ||
                              loading ||
                              loadErrorKind === "not_connected" ||
                              loadErrorKind === "supabase_invalid_key"
                            }
                          >
                            {t("creatorCardEditor.formats.otherAdd")}
                          </Button>
                        </div>
                        {introAppliedHint ? (
                          <div className="mt-2 text-xs text-slate-600">已套用到預覽，記得按右上儲存</div>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{t("creatorCardEditor.profile.themeTitle")}</div>
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={themeTypeInput}
                              placeholder={t("creatorCardEditor.profile.themePlaceholder")}
                              onChange={(e) => setThemeTypeInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addThemeTypeTag(themeTypeInput)
                                  setThemeTypeInput("")
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                addThemeTypeTag(themeTypeInput)
                                setThemeTypeInput("")
                              }}
                              disabled={!themeTypeInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                        {themeTypes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {themeTypes.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-slate-100"
                                  onClick={() => setThemeTypes((prev) => prev.filter((x) => x !== tag))}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{t("creatorCardEditor.profile.audienceTitle")}</div>
                        {audienceProfiles.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {audienceProfiles.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                              >
                                <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 hover:bg-slate-100"
                                  onClick={() => setAudienceProfiles((prev) => prev.filter((x) => x !== tag))}
                                  aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={audienceProfileInput}
                              placeholder={t("creatorCardEditor.profile.audiencePlaceholder")}
                              onChange={(e) => setAudienceProfileInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addAudienceProfileTag(audienceProfileInput)
                                  setAudienceProfileInput("")
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                addAudienceProfileTag(audienceProfileInput)
                                setAudienceProfileInput("")
                              }}
                              disabled={!audienceProfileInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: "contact",
                  titleZh: "聯絡方式",
                  titleEn: "Contact",
                  render: () => (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Email</div>
                        <div className="mt-2">
                          <Input
                            value={contactEmail}
                            placeholder="例如：hello@email.com"
                            onChange={(e) => {
                              setContactEmail(e.target.value)
                              markDirty()
                            }}
                          />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Instagram</div>
                        <div className="mt-2">
                          <Input
                            value={contactInstagram}
                            placeholder="@username or https://instagram.com/..."
                            onChange={(e) => {
                              setContactInstagram(e.target.value)
                              markDirty()
                            }}
                          />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Other</div>
                        <div className="mt-2">
                          <textarea
                            value={contactOther}
                            placeholder="例如：LINE / WhatsApp / 經紀窗口"
                            onChange={(e) => {
                              setContactOther(e.target.value)
                              markDirty()
                            }}
                            className="w-full min-h-[72px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/20"
                          />
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: "featured",
                  titleZh: "精選貼文",
                  titleEn: "Featured",
                  render: () => (
                    <>
                      <input
                        ref={featuredAddInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.currentTarget.files ?? [])
                          if (!files.length) return

                          setFeaturedItems((prev) => [
                            ...prev,
                            ...files.map((file) => ({
                              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                              url: URL.createObjectURL(file),
                              brand: "",
                              collabType: "",
                            })),
                          ])

                          e.currentTarget.value = ""
                        }}
                      />

                      <input
                        ref={featuredReplaceInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const id = pendingFeaturedReplaceIdRef.current
                          const file = e.target.files?.[0]
                          e.currentTarget.value = ""
                          if (!id || !file) return

                          const nextUrl = URL.createObjectURL(file)
                          setFeaturedItems((prev) => {
                            const idx = prev.findIndex((x) => x.id === id)
                            if (idx < 0) {
                              URL.revokeObjectURL(nextUrl)
                              return prev
                            }
                            const out = prev.slice()
                            const prevUrl = out[idx]?.url
                            if (typeof prevUrl === "string" && prevUrl.startsWith("blob:")) URL.revokeObjectURL(prevUrl)
                            out[idx] = { ...out[idx], url: nextUrl }
                            return out
                          })
                        }}
                      />

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => {
                            const { active, over } = event
                            if (!over) return
                            if (active.id === over.id) return
                            setFeaturedItems((prev) => {
                              const oldIndex = prev.findIndex((x) => x.id === active.id)
                              const newIndex = prev.findIndex((x) => x.id === over.id)
                              if (oldIndex < 0 || newIndex < 0) return prev
                              return arrayMove(prev, oldIndex, newIndex)
                            })
                            setSuppressFeaturedTileClick(true)
                            window.setTimeout(() => setSuppressFeaturedTileClick(false), 120)
                          }}
                          onDragCancel={() => {
                            setSuppressFeaturedTileClick(true)
                            window.setTimeout(() => setSuppressFeaturedTileClick(false), 120)
                          }}
                        >
                          <SortableContext items={featuredItems.map((x) => x.id)}>
                            {featuredItems.map((item) => (
                              <SortableFeaturedTile
                                key={item.id}
                                item={item}
                                suppressClick={suppressFeaturedTileClick}
                                onReplace={(id) => {
                                  pendingFeaturedReplaceIdRef.current = id
                                  featuredReplaceInputRef.current?.click()
                                }}
                                onEdit={(id) => {
                                  openEditFeatured(id)
                                }}
                                onRemove={(id) => {
                                  setFeaturedItems((prev) => {
                                    const picked = prev.find((x) => x.id === id)
                                    if (picked?.url && picked.url.startsWith("blob:")) URL.revokeObjectURL(picked.url)
                                    return prev.filter((x) => x.id !== id)
                                  })
                                }}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>

                        <button
                          type="button"
                          className="group relative w-full aspect-[3/4] overflow-hidden rounded-lg border border-dashed border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/20"
                          onClick={openAddFeatured}
                          aria-label="新增作品"
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Plus className="h-7 w-7 text-slate-300 group-hover:text-slate-400" />
                          </div>
                        </button>
                      </div>

                      {featuredItems.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-500">尚未新增作品</div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "formats",
                  titleZh: "合作形式",
                  titleEn: "Formats",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {formatOptions.map((opt) => {
                          const isActive =
                            opt.id === "other"
                              ? otherFormatEnabled
                              : opt.id === "fb_post"
                                ? deliverables.includes("fb_post") || deliverables.includes("fb") || deliverables.includes("facebook")
                                : deliverables.includes(opt.id)
                          return (
                            <Button
                              key={opt.id}
                              type="button"
                              variant="pill"
                              active={isActive}
                              onClick={() => {
                                if (opt.id === "other") {
                                  setOtherFormatEnabled((prev) => !prev)
                                  flashHighlight("formats")
                                  return
                                }
                                if (opt.id === "fb_post") {
                                  setDeliverables((prev) => {
                                    const hasAny = prev.includes("fb_post") || prev.includes("fb") || prev.includes("facebook")
                                    if (hasAny) return prev.filter((x) => x !== "fb_post" && x !== "fb" && x !== "facebook")
                                    return [...prev, "fb_post"]
                                  })
                                  flashHighlight("formats")
                                  return
                                }

                                setDeliverables((prev) => toggleInArray(prev, opt.id))
                                flashHighlight("formats")
                              }}
                            >
                              {t(opt.labelKey)}
                            </Button>
                          )
                        })}

                        {(() => {
                          const customs = pastCollaborations.filter((x) => !knownCollabTypeIds.has(x))
                          if (customs.length === 0) return null
                          return customs.map((tag) => (
                            <Button
                              key={tag}
                              type="button"
                              variant="pill"
                              active
                              onClick={() => {
                                setPastCollaborations((prev) => prev.filter((x) => x !== tag))
                                flashHighlight("formats")
                              }}
                            >
                              {tag}
                            </Button>
                          ))
                        })()}
                      </div>

                      {otherFormatEnabled ? (
                        <div className="mt-3 min-w-0">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={otherFormatInput}
                              placeholder={t("creatorCardEditor.formats.otherPlaceholder")}
                              disabled={!otherFormatEnabled}
                              onChange={(e) => setOtherFormatInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addOtherFormat()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={addOtherFormat}
                              disabled={!otherFormatEnabled || !otherFormatInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>

                          {null}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "niches",
                  titleZh: "合作品類",
                  titleEn: "Niches",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {nicheOptions.map((opt) => {
                          const isActive = collaborationNiches.includes(opt.id)
                          return (
                            <Button
                              key={opt.id}
                              type="button"
                              variant="pill"
                              active={isActive}
                              onClick={() => {
                                setCollaborationNiches((prev) => toggleInArray(prev, opt.id))
                                flashHighlight("niches")
                              }}
                            >
                              {t(opt.labelKey)}
                            </Button>
                          )
                        })}
                        <Button
                          type="button"
                          variant="pill"
                          active={otherNicheEnabled}
                          onClick={() => {
                            setOtherNicheEnabled((prev) => !prev)
                            flashHighlight("niches")
                          }}
                        >
                          {t("creatorCardEditor.formats.options.other")}
                        </Button>
                      </div>

                      {otherNicheEnabled ? (
                        <div className="mt-3 min-w-0">
                          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                            <Input
                              value={otherNicheInput}
                              placeholder={activeLocale === "zh-TW" ? "請輸入其他合作品類" : "Enter other niche"}
                              disabled={!otherNicheEnabled}
                              onChange={(e) => setOtherNicheInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addOtherNiche()
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={addOtherNiche}
                              disabled={!otherNicheEnabled || !otherNicheInput.trim()}
                            >
                              {t("creatorCardEditor.formats.otherAdd")}
                            </Button>
                          </div>

                          {(() => {
                            const customs = collaborationNiches.filter((x) => !knownNicheIds.has(x))
                            if (customs.length === 0) return null
                            return (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {customs.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                                  >
                                    <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-full p-1 hover:bg-slate-100"
                                      onClick={() => {
                                        setCollaborationNiches((prev) => prev.filter((x) => x !== tag))
                                        flashHighlight("niches")
                                      }}
                                      aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "brands",
                  titleZh: "過往合作",
                  titleEn: "Past Collabs",
                  render: () => (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {pastCollaborations.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                          >
                            <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                            <button
                              type="button"
                              className="shrink-0 rounded-full p-1 hover:bg-slate-100"
                              onClick={() => {
                                setPastCollaborations((prev) => prev.filter((x) => x !== tag))
                                flashHighlight("brands")
                              }}
                              aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="mt-3">
                        <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                          <Input
                            ref={(node) => {
                              brandInputRef.current = node
                            }}
                            value={brandInput}
                            placeholder={t("creatorCardEditor.pastCollaborations.placeholder")}
                            onChange={(e) => setBrandInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addBrandTag(brandInput)
                                setBrandInput("")
                                return
                              }
                              if (e.key === "Backspace" && !brandInput.trim()) {
                                setPastCollaborations((prev) => prev.slice(0, Math.max(0, prev.length - 1)))
                                flashHighlight("brands")
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              addBrandTag(brandInput)
                              setBrandInput("")
                            }}
                            disabled={!brandInput.trim()}
                          >
                            {t("creatorCardEditor.formats.otherAdd")}
                          </Button>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{brandHelperText}</div>
                      </div>
                    </>
                  ),
                },
              ]

              return (
                <>
                  <div className="lg:hidden">
                    <Accordion type="single" collapsible defaultValue="profile" className="w-full">
                      {sections.map((s) => (
                        <AccordionItem key={s.key} value={s.key}>
                          <AccordionTrigger className="text-left">
                            <span className="min-w-0 truncate">
                              {s.titleZh} / {s.titleEn}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent forceMount>
                            <div className="space-y-3">{s.render()}</div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>

                  <div className="hidden lg:block">
                    <div className="space-y-4">
                      {sections.map((s) => (
                        <Card key={s.key} className="overflow-hidden">
                          <CardHeader className="px-4 pt-4 lg:px-6 lg:pt-6">
                            <CardTitle className="text-base">
                              {s.titleZh} / {s.titleEn}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4 lg:px-6 lg:pb-6">
                            <div className="space-y-3">{s.render()}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          <div className="lg:col-span-7 min-w-0">
            <div className="lg:sticky lg:top-24">
              <CreatorCardPreview
                t={t}
                className="border-white/10 bg-transparent"
                headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
                useWidePhotoLayout
                photoUploadEnabled
                username={displayUsername || null}
                profileImageUrl={(() => {
                  const u = typeof igProfile?.profile_picture_url === "string" ? String(igProfile.profile_picture_url) : ""
                  return u ? u : null
                })()}
                displayName={displayName}
                aboutText={baseCard?.audience ?? null}
                primaryNiche={baseCard?.niche ?? null}
                contact={serializedContact}
                featuredItems={featuredItems}
                featuredImageUrls={featuredItems.map((x) => x.url)}
                themeTypes={themeTypes}
                audienceProfiles={audienceProfiles}
                collaborationNiches={collaborationNiches}
                deliverables={deliverables}
                pastCollaborations={pastCollaborations}
                followersText={followersText}
                postsText={postsText}
                engagementRateText={engagementRateText}
                highlightTarget={highlight}
              />
            </div>
          </div>
        </div>
      )}

      {__overlayMounted && editingFeaturedId
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                  setEditingFeaturedId(null)
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="mb-2 text-sm font-semibold text-slate-900">合作形式</div>
                <div className="mt-3">
                  <Input
                    value={editingFeaturedBrand}
                    placeholder={t("creatorCardEditor.pastCollaborations.placeholder")}
                    onChange={(e) => setEditingFeaturedBrand(e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  <select
                    value={editingFeaturedCollabTypeSelect}
                    onChange={(e) => {
                      const next = e.target.value
                      setEditingFeaturedCollabTypeSelect(next)
                      if (next !== COLLAB_TYPE_OTHER_VALUE) {
                        setEditingFeaturedCollabTypeCustom("")
                      }
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/20"
                  >
                    <option value="">合作形式</option>
                    {COLLAB_TYPE_OPTIONS.map((id) => {
                      const label = t(collabTypeLabelKey(id))
                      return (
                        <option key={id} value={label}>
                          {label}
                        </option>
                      )
                    })}
                    <option value={COLLAB_TYPE_OTHER_VALUE}>{t("creatorCardEditor.formats.options.other")}</option>
                  </select>
                </div>

                {editingFeaturedCollabTypeSelect === COLLAB_TYPE_OTHER_VALUE ? (
                  <div className="mt-2">
                    <Input value={editingFeaturedCollabTypeCustom} onChange={(e) => setEditingFeaturedCollabTypeCustom(e.target.value)} />
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingFeaturedId(null)
                    }}
                  >
                    {t("creatorCardEditor.actions.back")}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const id = editingFeaturedId
                      if (!id) return
                      const nextCollabType =
                        editingFeaturedCollabTypeSelect === COLLAB_TYPE_OTHER_VALUE
                          ? editingFeaturedCollabTypeCustom.trim()
                          : editingFeaturedCollabTypeSelect
                      setFeaturedItems((prev) =>
                        prev.map((x) => (x.id === id ? { ...x, brand: editingFeaturedBrand, collabType: nextCollabType } : x))
                      )
                      markDirty()
                      setEditingFeaturedId(null)
                    }}
                  >
                    {t("creatorCardEditor.actions.save")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  )
}
