import type { ReactNode } from "react"

type CardMobilePreviewShellProps = {
  children: ReactNode
  mode?: "page" | "embedded"
}

export function CardMobilePreviewShell({ children, mode = "page" }: CardMobilePreviewShellProps) {
  return (
    <div className={(mode === "page" ? "min-h-screen " : "") + "px-4 sm:px-6 py-1 sm:py-10"}>
      <div className="max-w-4xl mx-auto min-w-0">
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
