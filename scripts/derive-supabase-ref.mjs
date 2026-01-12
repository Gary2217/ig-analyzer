import fs from "node:fs"
import path from "node:path"

function readEnvFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath)
  const raw = fs.readFileSync(abs, "utf8")
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function deriveRefFromSupabaseUrl(supabaseUrl) {
  const u = new URL(supabaseUrl)
  const host = u.hostname
  // Expected: <ref>.supabase.co
  const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i)
  if (!m?.[1]) throw new Error(`Cannot derive project ref from hostname: ${host}`)
  return m[1]
}

const envFile = process.argv[2] || ".env.production.local"
const env = readEnvFile(envFile)
const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim()

if (!supabaseUrl) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL in ${envFile}`)
  process.exit(1)
}

const ref = deriveRefFromSupabaseUrl(supabaseUrl)
process.stdout.write(ref)
