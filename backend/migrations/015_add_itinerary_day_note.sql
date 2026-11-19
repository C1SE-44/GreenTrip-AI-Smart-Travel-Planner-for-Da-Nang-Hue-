-- Store optional notes attached to an itinerary day.
ALTER TABLE public.itinerary_days
    ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
