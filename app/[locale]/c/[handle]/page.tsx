import { supabaseServer } from "@/lib/supabase/server"

export default async function PublicCreatorCardPage({ params }: { params: { handle: string } }) {
  const handle = params.handle

  const { data } = await supabaseServer
    .from("creator_cards")
    .select("*")
    .eq("handle", handle)
    .eq("is_public", true)
    .limit(1)
    .maybeSingle()

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/80">
          <div className="text-[15px] font-semibold text-white">This creator card is not public</div>
          <div className="mt-2 text-[12px] text-white/60">The creator may still be editing, or has not published yet.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-white">Brand view</div>
            <div className="mt-1 text-[12px] text-white/60">
              @{data.ig_username || data.handle} · {data.completion_pct}% complete
            </div>
          </div>
          <span className="shrink-0 inline-flex items-center rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80">
            {data.completion_pct >= 70 ? "Collab-ready" : "Draft"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold text-white/60">Niche</div>
            <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{data.niche || "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold text-white/60">Audience</div>
            <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{data.audience || "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold text-white/60">Deliverables</div>
            <div className="mt-0.5 text-[12px] font-semibold text-white truncate">
              {Array.isArray(data.deliverables) ? data.deliverables.join(" / ") : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold text-white/60">Contact</div>
            <div className="mt-0.5 text-[12px] font-semibold text-white truncate">{data.contact || "—"}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] font-semibold text-white/60">Portfolio</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Array.isArray(data.portfolio) ? data.portfolio : []).slice(0, 3).map((p: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-white truncate">{p?.title || `Portfolio #${idx + 1}`}</div>
                <div className="mt-1 text-[10px] text-white/55 leading-snug line-clamp-2">{p?.desc || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
