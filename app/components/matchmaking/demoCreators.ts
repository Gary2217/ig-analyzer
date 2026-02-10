export type DemoCreatorSeed = {
  id: string
  handle: string
  displayName: string
  avatarUrl?: string
}

export const demoCreators: DemoCreatorSeed[] = [
  { id: "demo-01", handle: "mika.daily", displayName: "Mika" },
  { id: "demo-02", handle: "ray.streetfits", displayName: "Ray" },
  { id: "demo-03", handle: "lin.foodnotes", displayName: "Lin" },
  { id: "demo-04", handle: "karen.skinlab", displayName: "Karen" },
  { id: "demo-05", handle: "nico.travelbits", displayName: "Nico" },
  { id: "demo-06", handle: "zoe.stylepick", displayName: "Zoe" },
  { id: "demo-07", handle: "jay.techshorts", displayName: "Jay" },
]
