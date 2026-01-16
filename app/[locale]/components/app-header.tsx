"use client"

import Link from "next/link"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"

export default function AppHeader({ locale }: { locale: string }) {
  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md"
            >
              <Logo size={28} className="text-white" />
              <span>Social Analytics</span>
            </Link>

            <div className="flex items-center justify-end">
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
