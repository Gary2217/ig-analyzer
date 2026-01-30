import { en } from "./en"
import type { CopyDictionary } from "./types"
import { zhTW } from "./zh-TW"

export type Locale = "zh-TW" | "en"

const dictionaries: Record<Locale, CopyDictionary> = {
  "zh-TW": zhTW,
  en,
}

export function getCopy(locale: Locale): CopyDictionary {
  return dictionaries[locale] ?? dictionaries["zh-TW"]
}

export type { CopyDictionary } from "./types"
