export const COLLAB_TYPE_OPTIONS = [
  "reels",
  "posts",
  "stories",
  "live",
  "ugc",
  "unboxing",
  "giveaway",
  "event",
  "affiliate",
  "tiktok",
  "youtube",
  "fb_post",
] as const

export type CollabTypeOptionId = (typeof COLLAB_TYPE_OPTIONS)[number]

export const COLLAB_TYPE_OTHER_VALUE = "__other__" as const

export function collabTypeLabelKey(id: CollabTypeOptionId) {
  return id === "fb_post" ? "creatorCardEditor.formats.options.fbPost" : `creatorCardEditor.formats.options.${id}`
}
