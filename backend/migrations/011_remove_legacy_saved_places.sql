BEGIN;

DO $$
DECLARE
    legacy_saved_places regclass := to_regclass('public.saved_places');
BEGIN
    IF to_regclass('public.saved_place_collections') IS NULL
       OR to_regclass('public.saved_place_collection_items') IS NULL THEN
        RAISE EXCEPTION 'PB16 collection tables are missing; migration 011 stopped';
    END IF;

    IF legacy_saved_places IS NOT NULL THEN
        -- Refuse to continue if legacy rows cannot be represented by a valid POI.
        IF EXISTS (
            SELECT 1
            FROM public.saved_places AS saved
            LEFT JOIN public.pois AS poi ON poi.poi_id = saved.poi_id
            WHERE poi.poi_id IS NULL
        ) THEN
            RAISE EXCEPTION 'Legacy saved places contain unknown POIs; migration 011 stopped without deleting data';
        END IF;

        -- Ensure every legacy save has a default collection before copying memberships.
        INSERT INTO public.saved_place_collections (user_id, name, is_default)
        SELECT DISTINCT saved.user_id, 'Địa điểm của tôi', TRUE
        FROM public.saved_places AS saved
        ON CONFLICT (user_id) WHERE is_default DO NOTHING;

        INSERT INTO public.saved_place_collection_items (user_id, collection_id, poi_id, created_at)
        SELECT saved.user_id, collection.collection_id, saved.poi_id, saved.created_at
        FROM public.saved_places AS saved
        JOIN public.saved_place_collections AS collection
          ON collection.user_id = saved.user_id
         AND collection.is_default
        ON CONFLICT (collection_id, poi_id) DO NOTHING;

        -- Verify the transfer before removing the source table.
        IF EXISTS (
            SELECT 1
            FROM public.saved_places AS saved
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.saved_place_collection_items AS item
                JOIN public.saved_place_collections AS collection
                  ON collection.collection_id = item.collection_id
                 AND collection.user_id = item.user_id
                WHERE item.user_id = saved.user_id
                  AND item.poi_id = saved.poi_id
                  AND collection.is_default
            )
        ) THEN
            RAISE EXCEPTION 'Legacy saved-place transfer verification failed; migration 011 stopped without deleting data';
        END IF;

        -- Remove only the known PB16 legacy FK. No CASCADE is used.
        ALTER TABLE public.saved_place_collection_items
            DROP CONSTRAINT IF EXISTS fk_saved_place_collection_items_saved_place;

        IF EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_row
            WHERE constraint_row.contype = 'f'
              AND constraint_row.confrelid = legacy_saved_places
        ) THEN
            RAISE EXCEPTION 'Other foreign-key dependencies on public.saved_places remain; migration 011 stopped';
        END IF;

        -- DROP TABLE without CASCADE is an additional dependency guard.
        DROP TABLE public.saved_places;
    END IF;

    IF to_regclass('public.saved_places') IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy public.saved_places table still exists after migration 011';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.saved_place_collection_items'::regclass
          AND constraint_row.conname = 'fk_saved_place_collection_items_poi'
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.pois'::regclass
    ) THEN
        RAISE EXCEPTION 'Direct POI foreign key is missing; migration 011 stopped';
    END IF;
END
$$;

COMMIT;
