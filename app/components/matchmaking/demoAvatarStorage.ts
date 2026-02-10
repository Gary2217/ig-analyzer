export type DemoAvatarMap = Record<string, string> // id -> dataURL

const KEY = "mm_demo_avatars_v1"

export function loadDemoAvatars(): DemoAvatarMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as DemoAvatarMap
  } catch {
    return {}
  }
}

export function saveDemoAvatars(map: DemoAvatarMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // ignore quota errors
  }
}

export function setDemoAvatar(id: string, dataUrl: string) {
  const map = loadDemoAvatars()
  map[id] = dataUrl
  saveDemoAvatars(map)
}

export function clearDemoAvatar(id: string) {
  const map = loadDemoAvatars()
  delete map[id]
  saveDemoAvatars(map)
}

export async function fileToCompressedDataUrl(
  file: File,
  maxW = 900,
  maxH = 900,
  quality = 0.82
): Promise<string> {
  const img = new Image()
  const url = URL.createObjectURL(file)

  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error("image load failed"))
      img.src = url
    })

    const w0 = img.width || 1
    const h0 = img.height || 1
    const scale = Math.min(maxW / w0, maxH / h0, 1)
    const w = Math.round(w0 * scale)
    const h = Math.round(h0 * scale)

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d context")

    ctx.drawImage(img, 0, 0, w, h)

    const dataUrl = canvas.toDataURL("image/jpeg", quality)
    return dataUrl
  } finally {
    URL.revokeObjectURL(url)
  }
}
