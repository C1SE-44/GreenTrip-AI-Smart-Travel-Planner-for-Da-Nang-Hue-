-- Migration 006: Add commercial contact and operating hours fields to POIs
-- Adds phone_number, website_url, social_links JSONB, opening_hours JSONB, and email

ALTER TABLE public.pois
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS website_url TEXT,
    ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS email VARCHAR(150);

-- Indexes for fast lookup and B2B queries
CREATE INDEX IF NOT EXISTS idx_pois_phone ON public.pois(phone_number);
CREATE INDEX IF NOT EXISTS idx_pois_social_links ON public.pois USING gin(social_links);
CREATE INDEX IF NOT EXISTS idx_pois_opening_hours ON public.pois USING gin(opening_hours);
