"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { bumpAvatarBuster, useAvatarBuster, withAvatarBuster } from "@/app/lib/client/avatarBuster"

export function CreatorAvatarEditor({
  locale,
  avatarUrl,
  fallbackUrl,
  canEdit,
  onChanged,
}: {
  locale: "zh-TW" | "en"
  avatarUrl?: string | null
  fallbackUrl?: string | null
  canEdit: boolean
  onChanged?: (nextUrl: string | null) => void
}) {
  const buster = useAvatarBuster()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const effective = useMemo(() => {
    const picked = (String(avatarUrl || "") || String(fallbackUrl || "")).trim()
    return withAvatarBuster(picked || null, buster)
  }, [avatarUrl, buster, fallbackUrl])

  const t = useCallback(
    (zh: string, en: string) => (locale === "zh-TW" ? zh : en),
    [locale],
  )

  const doUpload = useCallback(
    async (file: File) => {
      if (uploading || resetting) return
      setErrorText(null)

      if (file.size > 5 * 1024 * 1024) {
        setErrorText(t("檔案太大（上限 5MB）", "File too large (max 5MB)"))
        return
      }
      const okType = /^(image\/png|image\/jpeg|image\/jpg|image\/webp)$/i.test(file.type)
      if (!okType) {
        setErrorText(t("請上傳 PNG/JPG/WebP 圖片", "Please upload a PNG/JPG/WebP image"))
        return
      }

      try {
        setUploading(true)
        const fd = new FormData()
        fd.append("file", file)

        const res = await fetch("/api/creator-cards/avatar", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        })

        const json: any = await res.json().catch(() => null)
        const nextUrl = typeof json?.avatarUrl === "string" ? json.avatarUrl.trim() : ""

        if (!res.ok || json?.ok !== true || !nextUrl) {
          setErrorText(t("上傳圖片失敗（請稍後再試）", "Upload image failed (please try again)"))
          return
        }

        bumpAvatarBuster()
        onChanged?.(nextUrl)
      } catch {
        setErrorText(t("上傳圖片失敗（請稍後再試）", "Upload image failed (please try again)"))
      } finally {
        setUploading(false)
      }
    },
    [onChanged, resetting, t, uploading],
  )

  const doReset = useCallback(async () => {
    if (uploading || resetting) return
    setErrorText(null)

    try {
      setResetting(true)
      const res = await fetch("/api/creator-card/avatar/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      })

      const json: any = await res.json().catch(() => null)
      if (!res.ok || json?.ok !== true) {
        setErrorText(t("重設失敗（請稍後再試）", "Reset failed (please try again)"))
        return
      }

      bumpAvatarBuster()
      onChanged?.(null)
    } catch {
      setErrorText(t("重設失敗（請稍後再試）", "Reset failed (please try again)"))
    } finally {
      setResetting(false)
    }
  }, [onChanged, resetting, t, uploading])

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={async (e) => {
          e.preventDefault()
          e.stopPropagation()
          const file = e.target.files?.[0] ?? null
          e.currentTarget.value = ""
          if (!file) return
          if (!canEdit) return
          await doUpload(file)
        }}
      />

      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-slate-950/40">
            {effective ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={effective}
                alt={t("頭貼", "Avatar")}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-pink-500/20" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              type="button"
              className="min-w-0 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 min-h-[44px] disabled:opacity-60"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!canEdit) return
                inputRef.current?.click()
              }}
              aria-busy={uploading}
              disabled={!canEdit || uploading || resetting}
            >
              <span className="min-w-0 truncate">
                {uploading ? t("上傳中...", "Uploading...") : t("上傳圖片", "Upload image")}
              </span>
            </button>

            <button
              type="button"
              className="min-w-0 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 min-h-[44px] disabled:opacity-60"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!canEdit) return
                void doReset()
              }}
              aria-busy={resetting}
              disabled={!canEdit || uploading || resetting}
            >
              <span className="min-w-0 truncate">
                {resetting ? t("重設中...", "Resetting...") : t("重設", "Reset")}
              </span>
            </button>
          </div>

          {errorText ? (
            <div className="mt-2 text-xs text-rose-200/80 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
              {errorText}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 text-xs text-white/55 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
        {t("顯示於公開名片", "Shown on public creator card")}
      </div>
    </div>
  )
}
