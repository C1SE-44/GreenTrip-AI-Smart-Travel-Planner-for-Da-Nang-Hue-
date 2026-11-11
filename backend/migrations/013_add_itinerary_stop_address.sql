-- Keep optional addresses attached to itinerary snapshots, including custom ideas.
ALTER TABLE public.itinerary_stops
    ADD COLUMN IF NOT EXISTS address TEXT;
