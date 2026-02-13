import { describe, expect, it } from "vitest"
import {
  buildSearchHaystack,
  applyPinnedOwnerCard,
  getCreatorCollabTypes,
  matchesCreatorQuery,
  normalizeSelectedCollabTypes,
  shouldIncludeDemoFill,
} from "@/app/lib/matchmaking/search"
import { buildDemoFillCards } from "@/app/lib/matchmaking/demoFill"

describe("matchmaking/search helpers", () => {
  it("1-letter search: L matches Lin", () => {
    const c = { id: "demo-03", name: "Lin", handle: "lin.foodnotes" }
    expect(matchesCreatorQuery(c, "L")).toBe(true)
    expect(matchesCreatorQuery(c, "l")).toBe(true)
    expect(matchesCreatorQuery(c, "Z")).toBe(false)
  })

  it("special chars: _ matches _gary, . matches .lin", () => {
    const c1 = { id: "1", name: "Gary", handle: "_gary" }
    const c2 = { id: "2", name: "Lin", handle: ".lin" }
    expect(matchesCreatorQuery(c1, "_")).toBe(true)
    expect(matchesCreatorQuery(c2, ".")).toBe(true)
  })

  it("numeric-leading: 50 matches 50studio", () => {
    const c = { id: "x", name: "50studio", handle: "50studio" }
    expect(matchesCreatorQuery(c, "50")).toBe(true)
  })

  it("prefix-only: food does NOT match lin.foodnotes", () => {
    const c = { id: "demo-03", name: "Lin", handle: "lin.foodnotes" }
    expect(matchesCreatorQuery(c, "food")).toBe(false)
    expect(matchesCreatorQuery(c, "lin")).toBe(true)
  })

  it("demo gating: search active does NOT exclude demos; tags/collab/budget DO exclude demos", () => {
    expect(shouldIncludeDemoFill({ hasTagFilterActive: false, hasCollabTypeFilterActive: false, hasBudgetFilterActive: false })).toBe(true)
    expect(shouldIncludeDemoFill({ hasTagFilterActive: true, hasCollabTypeFilterActive: false, hasBudgetFilterActive: false })).toBe(false)
    expect(shouldIncludeDemoFill({ hasTagFilterActive: false, hasCollabTypeFilterActive: true, hasBudgetFilterActive: false })).toBe(false)
    expect(shouldIncludeDemoFill({ hasTagFilterActive: false, hasCollabTypeFilterActive: false, hasBudgetFilterActive: true })).toBe(false)
  })

  it("collabTypes normalization handles object shapes and creator fields under raw mirrors", () => {
    const selected = [{ value: { value: { id: "UGC" } } }, { value: { name: "live" } }, "other"]
    expect(normalizeSelectedCollabTypes(selected)).toEqual(["ugc", "live", "other"])

    const c = {
      collab_types: ["event"],
      __rawCard: { collabTypes: ["UGC"], collab_type: "other" },
      raw: { collabType: "live" },
      card: { collab_types: ["review_unboxing"] },
    }
    expect(getCreatorCollabTypes(c)).toEqual(["event", "ugc", "other", "live", "review_unboxing"])
  })

  it("creator types/tags coverage: all field variants are included in haystack", () => {
    const c = {
      name: "Lin",
      handle: "lin.foodnotes",
      creatorTypes: ["美妝"],
      creatorType: "旅遊",
      creator_types: ["3C"],
      tagCategories: ["開箱"],
      tag_categories: ["時尚"],
      tags: ["KOL"],
      categories: ["美食"],
      niches: ["探店"],
      verticals: ["生活"],
      topics: ["Vlog"],
      __rawCard: {
        creatorTypes: ["保養"],
        creatorType: "健身",
        creator_types: ["餐飲"],
        tagCategories: ["露營"],
        tag_categories: ["戶外"],
        tags: ["攝影"],
        categories: ["電商"],
        niches: ["親子"],
        verticals: ["理財"],
        topics: ["娛樂"],
      },
      raw: {
        creatorTypes: ["職場"],
        tag_categories: ["教育"],
      },
      card: {
        creator_types: ["音樂"],
        tags: ["手作"],
      },
      collabTypes: ["other"],
    }

    const hay = buildSearchHaystack(c).toLowerCase()
    const mustInclude = [
      "美妝",
      "旅遊",
      "3c",
      "開箱",
      "時尚",
      "kol",
      "美食",
      "探店",
      "生活",
      "vlog",
      "保養",
      "健身",
      "餐飲",
      "露營",
      "戶外",
      "攝影",
      "電商",
      "親子",
      "理財",
      "娛樂",
      "職場",
      "教育",
      "音樂",
      "手作",
    ]

    for (const t of mustInclude) expect(hay).toContain(String(t).toLowerCase())
  })

  it("pinned owner: default browsing pins owner first; search/filter states do not inject", () => {
    const a = { id: "a" }
    const b = { id: "b" }
    const pinned = { id: "me" }

    // A) default browsing => pinned first
    expect(
      applyPinnedOwnerCard({ list: [a, b], pinned, hasSearchActive: false, isFilteringActive: false }).map((x) => x.id),
    ).toEqual(["me", "a", "b"])

    // de-dupe if list already contains owner
    expect(
      applyPinnedOwnerCard({ list: [a, pinned, b], pinned, hasSearchActive: false, isFilteringActive: false }).map((x) => x.id),
    ).toEqual(["me", "a", "b"])

    // B/C/D) any search/filter state => no injection
    expect(
      applyPinnedOwnerCard({ list: [a, b], pinned, hasSearchActive: true, isFilteringActive: false }).map((x) => x.id),
    ).toEqual(["a", "b"])
    expect(
      applyPinnedOwnerCard({ list: [a, b], pinned, hasSearchActive: false, isFilteringActive: true }).map((x) => x.id),
    ).toEqual(["a", "b"])
  })
})

describe("matchmaking/demo fill contract", () => {
  it("demo cards always have platforms + collabTypes present and mirrored to __rawCard", () => {
    const out = buildDemoFillCards({
      creators: [],
      page: 1,
      pageSize: 8,
      locale: "en",
      demoAvatarMap: {},
    })

    expect(out.length).toBeGreaterThan(0)
    for (const c of out) {
      expect(Array.isArray((c as any).platforms)).toBe(true)
      expect((c as any).platforms.length).toBeGreaterThan(0)
      expect(Array.isArray((c as any).collabTypes)).toBe(true)
      expect((c as any).collabTypes.length).toBeGreaterThan(0)

      const raw = (c as any).__rawCard
      expect(raw && typeof raw === "object").toBe(true)
      expect(Array.isArray((raw as any).platforms)).toBe(true)
      expect((raw as any).platforms.length).toBeGreaterThan(0)
      expect(Array.isArray((raw as any).collabTypes)).toBe(true)
      expect((raw as any).collabTypes.length).toBeGreaterThan(0)
    }
  })
})
