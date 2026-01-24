"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import Image from "next/image"
import { Plus, X, FileText, Instagram as InstagramIcon } from "lucide-react"
import { useEffect, useRef } from "react"

type FeaturedItemBase = {
  id: string
}

type FeaturedMediaItem = FeaturedItemBase & {
  type: "media"
  url: string
  brand: string
  collabType: string
  caption?: string
  uploadStatus?: "idle" | "uploading" | "failed"
}

type FeaturedTextItem = FeaturedItemBase & {
  type: "text"
  title?: string
  text: string
}

type FeaturedIgItem = FeaturedItemBase & {
  type: "ig"
  url: string
  caption?: string
}

export type FeaturedItem = FeaturedMediaItem | FeaturedTextItem | FeaturedIgItem

function getCollabTypeDisplayLabel(rawType: string, t: (key: string) => string): string {
  const COLLAB_TYPE_OPTIONS = ["ig_post", "ig_story", "ig_reel", "fb_post", "yt_video", "yt_short", "tiktok"]
  
  if (COLLAB_TYPE_OPTIONS.includes(rawType)) {
    return t(`creatorCard.collabType.${rawType}`)
  }
  return rawType || t("creatorCardEditor.common.select")
}

export function SortableFeaturedTile(props: {
  item: FeaturedItem
  t: (key: string) => string
  onReplace?: (id: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
  onCaptionChange?: (id: string, caption: string) => void
  onTextChange?: (id: string, text: string, title?: string) => void
  onIgUrlChange?: (id: string, url: string) => void
  suppressClick: boolean
  activeLocale: string
}) {
  const { item, t, onReplace, onRemove, onEdit, onCaptionChange, onTextChange, onIgUrlChange, suppressClick } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id })
  const embedRef = useRef<HTMLDivElement>(null)

  // Load Instagram embed script for IG items
  useEffect(() => {
    if (item.type === "ig" && item.url && embedRef.current) {
      if (!window.instgrm) {
        const script = document.createElement("script")
        script.src = "https://www.instagram.com/embed.js"
        script.async = true
        script.onload = () => {
          if (window.instgrm?.Embeds) {
            window.instgrm.Embeds.process()
          }
        }
        document.body.appendChild(script)
      } else if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process()
      }
    }
  }, [item])

  // Media item
  if (item.type === "media") {
    const featuredChipText = (() => {
      const rawType = typeof item.collabType === "string" ? item.collabType : ""
      if (!rawType.trim()) return t("creatorCardEditor.common.select")
      return getCollabTypeDisplayLabel(rawType, t)
    })()

    return (
      <div className="space-y-2">
        <div
          ref={setNodeRef}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          className={
            "group relative w-full aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-white/5 shadow-sm transition-colors " +
            (isDragging ? "scale-[1.04] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
            (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "") +
            (isDragging ? " cursor-grabbing" : " cursor-grab")
          }
          {...attributes}
          {...listeners}
        >
          <button
            type="button"
            className={"absolute inset-0 z-0 " + (!item.url ? "flex flex-col items-center justify-center gap-1 text-slate-600" : "")}
            onClick={() => {
              if (suppressClick) return
              onReplace?.(item.id)
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
            <Image src={item.url} alt="" fill sizes="100vw" unoptimized className="object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-white/5">
              <Plus className="h-7 w-7 text-white/25" />
            </div>
          )}

          {item.url ? (
            <div className={"pointer-events-none absolute inset-0 bg-black/35 transition-opacity " + (isDragging ? "opacity-0" : "opacity-35 group-hover:opacity-0")} />
          ) : null}

          {item.url ? (
            <button
              type="button"
              className="absolute left-1 top-1 z-10 rounded-md bg-white/90 px-2 py-1 shadow-sm hover:bg-white"
              aria-label={featuredChipText}
              onPointerDownCapture={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit(item.id)
              }}
            >
              <span className="block min-w-0 max-w-full truncate text-[11px] font-semibold text-slate-700">{featuredChipText}</span>
            </button>
          ) : null}

          {item.uploadStatus === "failed" ? (
            <div className="absolute bottom-1 left-1 right-1 z-10 rounded-md bg-red-500/90 px-2 py-1 text-center shadow-sm">
              <span className="block text-[11px] font-semibold text-white">{t("creatorCard.form.featured.uploadFailed")}</span>
            </div>
          ) : null}

          <button
            type="button"
            className="absolute right-1 top-1 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
            onPointerDownCapture={(e) => {
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

        {/* Caption textarea */}
        <div className="w-full">
          <textarea
            value={item.caption || ""}
            onChange={(e) => onCaptionChange?.(item.id, e.target.value)}
            placeholder={t("creatorCard.featured.caption")}
            className="w-full min-h-[60px] px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none resize-y"
            rows={2}
          />
        </div>
      </div>
    )
  }

  // Text item
  if (item.type === "text") {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={
          "group relative w-full min-h-[200px] p-4 rounded-lg border border-white/10 bg-white/5 shadow-sm transition-colors space-y-3 " +
          (isDragging ? "scale-[1.04] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
          (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "") +
          (isDragging ? " cursor-grabbing" : " cursor-grab")
        }
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-white/60" />
          <span className="text-xs font-semibold text-white/60">{t("creatorCard.featured.textItem")}</span>
        </div>

        <input
          type="text"
          value={item.title || ""}
          onChange={(e) => onTextChange?.(item.id, item.text, e.target.value)}
          placeholder={t("creatorCard.featured.textTitle")}
          className="w-full px-3 py-2 text-sm font-semibold bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none"
          onPointerDown={(e) => e.stopPropagation()}
        />

        <textarea
          value={item.text}
          onChange={(e) => onTextChange?.(item.id, e.target.value, item.title)}
          placeholder={t("creatorCard.featured.textContent")}
          className="w-full min-h-[120px] px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none resize-y"
          rows={5}
          onPointerDown={(e) => e.stopPropagation()}
        />

        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
          onPointerDownCapture={(e) => {
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

  // IG item
  if (item.type === "ig") {
    const isValidIgUrl = item.url && (item.url.includes("instagram.com/p/") || item.url.includes("instagram.com/reel/") || item.url.includes("instagram.com/tv/"))

    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={
          "group relative w-full min-h-[200px] p-4 rounded-lg border border-white/10 bg-white/5 shadow-sm transition-colors space-y-3 " +
          (isDragging ? "scale-[1.04] shadow-xl ring-2 ring-white/30 opacity-95" : "hover:border-white/20 hover:bg-white/10") +
          (!isDragging && isOver ? " ring-2 ring-emerald-400/50" : "") +
          (isDragging ? " cursor-grabbing" : " cursor-grab")
        }
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 mb-2">
          <InstagramIcon className="h-4 w-4 text-white/60" />
          <span className="text-xs font-semibold text-white/60">{t("creatorCard.featured.igItem")}</span>
        </div>

        <input
          type="url"
          value={item.url}
          onChange={(e) => onIgUrlChange?.(item.id, e.target.value)}
          placeholder={t("creatorCard.featured.igUrl")}
          className="w-full px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none"
          onPointerDown={(e) => e.stopPropagation()}
        />

        <textarea
          value={item.caption || ""}
          onChange={(e) => onCaptionChange?.(item.id, e.target.value)}
          placeholder={t("creatorCard.featured.caption")}
          className="w-full min-h-[60px] px-3 py-2 text-sm bg-slate-950/40 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-white/20 focus:outline-none resize-y"
          rows={2}
          onPointerDown={(e) => e.stopPropagation()}
        />

        {/* IG Embed or fallback */}
        {item.url && (
          <div className="mt-3">
            {isValidIgUrl ? (
              <div ref={embedRef} className="w-full max-w-full overflow-hidden">
                <blockquote className="instagram-media" data-instgrm-permalink={item.url} data-instgrm-version="14"></blockquote>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                <InstagramIcon className="h-8 w-8 mx-auto mb-2 text-white/40" />
                <p className="text-xs text-white/60 mb-3">{t("creatorCard.featured.igPreviewUnavailable")}</p>
              </div>
            )}
            
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/90 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-white/15 rounded-lg hover:from-purple-500/30 hover:to-pink-500/30 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <InstagramIcon className="h-4 w-4" />
              <span>{t("creatorCard.featured.openOnInstagram")}</span>
            </a>
          </div>
        )}

        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
          onPointerDownCapture={(e) => {
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

  return null
}

// Type guard helpers
export function isFeaturedMediaItem(item: FeaturedItem): item is FeaturedMediaItem {
  return item.type === "media"
}

export function isFeaturedTextItem(item: FeaturedItem): item is FeaturedTextItem {
  return item.type === "text"
}

export function isFeaturedIgItem(item: FeaturedItem): item is FeaturedIgItem {
  return item.type === "ig"
}

// Declare Instagram embed global
declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void
      }
    }
  }
}
