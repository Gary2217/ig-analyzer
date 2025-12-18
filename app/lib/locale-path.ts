export type SupportedLocale = "zh-TW" | "en"

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "zh-TW" || value === "en"
}

export function extractLocaleFromPathname(pathname: string): {
  locale: SupportedLocale | null
  restPathname: string
} {
  const clean = pathname || "/"
  const parts = clean.split("/").filter(Boolean)
  const maybe = parts[0]

  if (isSupportedLocale(maybe)) {
    const rest = parts.slice(1)
    const restPathname = rest.length ? `/${rest.join("/")}` : "/"
    return { locale: maybe, restPathname }
  }

  return { locale: null, restPathname: clean.startsWith("/") ? clean : `/${clean}` }
}

export function localePathname(pathname: string, locale: SupportedLocale): string {
  const { restPathname } = extractLocaleFromPathname(pathname)
  const normalized = restPathname.startsWith("/") ? restPathname : `/${restPathname}`
  const rest = normalized === "/" ? "" : normalized
  return `/${locale}${rest || "/"}`
}

export function localeUrl(pathname: string, locale: SupportedLocale, search: string): string {
  const p = localePathname(pathname, locale)
  const s = (search || "").trim()
  if (!s) return p
  return s.startsWith("?") ? `${p}${s}` : `${p}?${s}`
}
