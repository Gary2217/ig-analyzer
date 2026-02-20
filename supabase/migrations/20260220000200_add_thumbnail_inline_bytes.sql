-- Add inline_bytes column for small images (<= 512KB) to avoid Storage round-trip on L2 HIT
ALTER TABLE public.ig_thumbnail_cache
  ADD COLUMN IF NOT EXISTS inline_bytes text;  -- base64-encoded image bytes, nullable
