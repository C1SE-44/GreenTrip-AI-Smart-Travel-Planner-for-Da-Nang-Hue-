-- Migration 004: Add image_url and gallery_urls to public.pois
ALTER TABLE public.pois
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}'::text[];
