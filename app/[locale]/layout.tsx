import { cookies } from "next/headers"
import { LocaleProvider } from "./components/locale-provider"
import LocaleSwitcher from "../components/locale-switcher"
import { loadMessages, type Locale } from "../lib/i18n"

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("locale")?.value
  const locale: Locale =
    cookieLocale === "zh-TW" || cookieLocale === "en"
      ? cookieLocale
      : "en"

  const messages = await loadMessages(locale)

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <div className="min-h-screen w-full flex flex-col">
        <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Language: {locale}
            </div>
            <LocaleSwitcher />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </LocaleProvider>
  )
}
