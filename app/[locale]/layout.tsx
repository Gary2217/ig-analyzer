import { LocaleProvider } from "./components/locale-provider"
import AppHeader from "./components/app-header"
import { loadMessages, type Locale } from "../lib/i18n"
import { InstagramConnectionProvider } from "../components/InstagramConnectionProvider"
import GlobalReauthPrompt from "../components/GlobalReauthPrompt"
import { SiteSessionProvider } from "../components/SiteSessionProvider"

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
      <SiteSessionProvider>
        <InstagramConnectionProvider>
          <div className="w-full flex flex-col">
            <AppHeader locale={locale} />
            <GlobalReauthPrompt locale={locale} />

            <div className="flex-1">{children}</div>
          </div>
        </InstagramConnectionProvider>
      </SiteSessionProvider>
    </LocaleProvider>
  )
}
