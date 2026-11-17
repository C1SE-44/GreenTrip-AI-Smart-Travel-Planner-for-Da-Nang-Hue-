-- Migration 014: Unify legacy 008 (itinerary_*) and 012 (trip_*/day_*/stop_*) itinerary schemas and add missing indexes.
-- Idempotent, zero-drop, backward-compatible with all existing repositories.

BEGIN;

-- 1. Ensure unified columns exist on public.itineraries
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS itinerary_id VARCHAR(64);
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS total_days SMALLINT DEFAULT 1;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS days_count INTEGER DEFAULT 1;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE public.itineraries
SET
    itinerary_id = COALESCE(itinerary_id, trip_id),
    trip_id = COALESCE(trip_id, itinerary_id),
    total_days = COALESCE(total_days, days_count, 1),
    days_count = COALESCE(days_count, total_days, 1),
    status = COALESCE(status, 'DRAFT'),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE
    itinerary_id IS NULL
    OR trip_id IS NULL
    OR total_days IS NULL
    OR days_count IS NULL
    OR status IS NULL
    OR updated_at IS NULL;

-- 2. Ensure unified columns exist on public.itinerary_days
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS itinerary_day_id VARCHAR(64);
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS day_id TEXT;
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS itinerary_id VARCHAR(64);
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS theme VARCHAR(255);
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS focus_city VARCHAR(100);

UPDATE public.itinerary_days
SET
    itinerary_day_id = COALESCE(itinerary_day_id, day_id),
    day_id = COALESCE(day_id, itinerary_day_id),
    itinerary_id = COALESCE(itinerary_id, trip_id),
    trip_id = COALESCE(trip_id, itinerary_id),
    title = COALESCE(title, theme, '')
WHERE
    itinerary_day_id IS NULL
    OR day_id IS NULL
    OR itinerary_id IS NULL
    OR trip_id IS NULL
    OR title IS NULL;

-- 3. Ensure unified columns exist on public.itinerary_stops
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS itinerary_stop_id VARCHAR(64);
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS stop_id TEXT;
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS itinerary_day_id VARCHAR(64);
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS day_id TEXT;
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS stop_type TEXT DEFAULT 'poi';
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'idea';
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS sequence INTEGER DEFAULT 0;
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS sequence_no SMALLINT;
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS time_slot VARCHAR(50);
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.itinerary_stops
SET
    itinerary_stop_id = COALESCE(itinerary_stop_id, stop_id),
    stop_id = COALESCE(stop_id, itinerary_stop_id),
    itinerary_day_id = COALESCE(itinerary_day_id, day_id),
    day_id = COALESCE(day_id, itinerary_day_id),
    sequence = COALESCE(sequence, sequence_no, 0),
    sequence_no = COALESCE(sequence_no, sequence, 0),
    title = COALESCE(NULLIF(title, ''), NULLIF(notes, ''), poi_id, 'Điểm dừng'),
    stop_type = COALESCE(stop_type, 'poi'),
    source = COALESCE(source, 'idea')
WHERE
    itinerary_stop_id IS NULL
    OR stop_id IS NULL
    OR itinerary_day_id IS NULL
    OR day_id IS NULL
    OR sequence IS NULL
    OR sequence_no IS NULL
    OR title IS NULL
    OR title = ''
    OR stop_type IS NULL
    OR source IS NULL;

-- 4. Missing secondary indexes for query performance
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON public.itineraries (user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_itinerary_id ON public.itineraries (itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_days_itinerary_id ON public.itinerary_days (itinerary_id, day_number);
CREATE INDEX IF NOT EXISTS idx_itinerary_stops_itinerary_day_id ON public.itinerary_stops (itinerary_day_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_itinerary_stops_poi_id ON public.itinerary_stops (poi_id);
CREATE INDEX IF NOT EXISTS idx_pois_city_active ON public.pois (city_id, is_active);
CREATE INDEX IF NOT EXISTS idx_email_otps_email_created ON public.email_otps (email, created_at DESC);

COMMIT;
