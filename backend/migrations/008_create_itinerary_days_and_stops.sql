CREATE TABLE IF NOT EXISTS public.itineraries (
    trip_id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date DATE,
    days_count INTEGER NOT NULL CONSTRAINT itineraries_days_count_range CHECK (days_count BETWEEN 1 AND 31),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.itinerary_days (
    day_id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES public.itineraries(trip_id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL CONSTRAINT itinerary_days_day_number_range CHECK (day_number BETWEEN 1 AND 31),
    date DATE,
    title TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, day_number)
);

CREATE TABLE IF NOT EXISTS public.itinerary_stops (
    stop_id TEXT PRIMARY KEY,
    day_id TEXT NOT NULL REFERENCES public.itinerary_days(day_id) ON DELETE CASCADE,
    poi_id TEXT,
    title TEXT NOT NULL,
    city TEXT,
    category TEXT,
    stop_type TEXT NOT NULL DEFAULT 'poi' CONSTRAINT itinerary_stops_stop_type_allowed CHECK (stop_type IN ('poi', 'rest', 'custom')),
    source TEXT NOT NULL DEFAULT 'idea' CONSTRAINT itinerary_stops_source_allowed CHECK (source IN ('idea', 'manual', 'assistant')),
    sequence INTEGER NOT NULL CONSTRAINT itinerary_stops_sequence_nonnegative CHECK (sequence >= 0),
    duration_minutes INTEGER CONSTRAINT itinerary_stops_duration_range CHECK (duration_minutes BETWEEN 1 AND 1440),
    start_time TEXT,
    end_time TEXT,
    comment TEXT,
    latitude DOUBLE PRECISION CONSTRAINT itinerary_stops_latitude_range CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CONSTRAINT itinerary_stops_longitude_range CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT itinerary_stops_day_sequence_unique UNIQUE (day_id, sequence)
);

-- Upgrade tables created by an earlier API bootstrap without replacing existing rows.
ALTER TABLE public.itineraries
    ALTER COLUMN start_date TYPE DATE USING NULLIF(start_date::text, '')::date;
ALTER TABLE public.itinerary_days
    ALTER COLUMN date TYPE DATE USING NULLIF(date::text, '')::date;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itineraries'::regclass AND conname = 'itineraries_days_count_range') THEN
        ALTER TABLE public.itineraries ADD CONSTRAINT itineraries_days_count_range CHECK (days_count BETWEEN 1 AND 31);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_days'::regclass AND conname = 'itinerary_days_day_number_range') THEN
        ALTER TABLE public.itinerary_days ADD CONSTRAINT itinerary_days_day_number_range CHECK (day_number BETWEEN 1 AND 31);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_stop_type_allowed') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_stop_type_allowed CHECK (stop_type IN ('poi', 'rest', 'custom'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_source_allowed') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_source_allowed CHECK (source IN ('idea', 'manual', 'assistant'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_sequence_nonnegative') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_sequence_nonnegative CHECK (sequence >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_duration_range') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_duration_range CHECK (duration_minutes BETWEEN 1 AND 1440);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_latitude_range') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_latitude_range CHECK (latitude BETWEEN -90 AND 90);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_longitude_range') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_longitude_range CHECK (longitude BETWEEN -180 AND 180);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.itinerary_stops'::regclass AND conname = 'itinerary_stops_day_sequence_unique') THEN
        ALTER TABLE public.itinerary_stops ADD CONSTRAINT itinerary_stops_day_sequence_unique UNIQUE (day_id, sequence);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip ON public.itinerary_days (trip_id, day_number);
CREATE INDEX IF NOT EXISTS idx_itinerary_stops_day ON public.itinerary_stops (day_id, sequence);
