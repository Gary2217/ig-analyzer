"use client"

import { useEffect, useRef } from "react"
import { Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AuthGateModalProps {
  locale: "zh-TW" | "en"
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
}

export function AuthGateModal({ locale, isOpen, onClose, onLogin }: AuthGateModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  const copy = locale === "zh-TW"
    ? {
        title: "需要登入",
        message: "請先登入您的 Instagram 帳號以查看完整的創作者資訊",
        loginButton: "使用 Instagram 登入",
        cancelButton: "取消",
        close: "關閉",
      }
    : {
        title: "Login Required",
        message: "Please log in with your Instagram account to view full creator details",
        loginButton: "Log in with Instagram",
        cancelButton: "Cancel",
        close: "Close",
      }

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEsc)
    return () => document.removeEventListener("keydown", handleEsc)
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY
      document.body.style.position = "fixed"
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = "100%"

      return () => {
        document.body.style.position = ""
        document.body.style.top = ""
        document.body.style.width = ""
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener("keydown", handleTab)
    firstElement?.focus()

    return () => document.removeEventListener("keydown", handleTab)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md
                   rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-500/10">
              <Lock className="w-5 h-5 text-sky-400" />
            </div>
            <h2 id="modal-title" className="text-lg font-semibold text-white">
              {copy.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 p-0 text-white/60 hover:text-white hover:bg-white/10"
            aria-label={copy.close}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <p className="text-sm text-white/70 leading-relaxed">
            {copy.message}
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="default"
              size="lg"
              onClick={onLogin}
              className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-semibold"
            >
              {copy.loginButton}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={onClose}
              className="flex-1 border-white/10 text-white/80 hover:bg-white/5"
            >
              {copy.cancelButton}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
