import { LocaleProvider } from "./components/locale-provider"
import Link from "next/link"
import Logo from "../../components/Logo"
import LocaleSwitcher from "../components/locale-switcher"
import { loadMessages, type Locale } from "../lib/i18n"

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const resolvedParams = await params
  const rawLocale = resolvedParams?.locale
  const locale: Locale = rawLocale === "zh-TW" ? "zh-TW" : "en"

  const messages = await loadMessages(locale)

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <div className="min-h-screen w-full flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/70 backdrop-blur">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <Link
                href={`/${locale}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white motion-safe:transition-all motion-safe:duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md"
              >
                <Logo size={28} className="text-white" />
                <span>IG Analyzer</span>
              </Link>

              <div className="flex items-center justify-end">
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </LocaleProvider>
  )
}
