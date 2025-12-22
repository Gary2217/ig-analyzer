import { LocaleProvider } from "./components/locale-provider"
import AppHeader from "./components/app-header"
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
      <div className="w-full flex flex-col">
        <AppHeader locale={locale} />

        <main className="flex-1">{children}</main>
      </div>
    </LocaleProvider>
  )
}
