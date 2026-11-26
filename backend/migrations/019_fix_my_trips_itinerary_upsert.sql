-- Migration 019: Make the unified itinerary schema compatible with authenticated upserts.
-- Migration 014 adds trip_id to databases created from the legacy 008 schema, but does
-- not make it unique; the /my-trips upsert requires a unique conflict target.
-- Legacy 008 also made poi_id NOT NULL, although rest/custom stops do not have a POI.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.itineraries
        WHERE trip_id IS NULL OR BTRIM(trip_id) = ''
    ) THEN
        RAISE EXCEPTION 'Migration 019 cannot make itineraries.trip_id unique: null or empty trip IDs exist.';
    END IF;

    IF EXISTS (
        SELECT trip_id
        FROM public.itineraries
        GROUP BY trip_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Migration 019 cannot make itineraries.trip_id unique: duplicate trip IDs exist.';
    END IF;
END
$$;

ALTER TABLE public.itineraries
    ALTER COLUMN trip_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_trip_id
    ON public.itineraries (trip_id);

ALTER TABLE public.itinerary_stops
    ALTER COLUMN poi_id DROP NOT NULL;

COMMIT;
