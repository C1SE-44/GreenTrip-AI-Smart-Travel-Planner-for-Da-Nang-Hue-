BEGIN;

DO $$
BEGIN
    IF to_regclass('public.saved_place_collections') IS NULL
       OR to_regclass('public.saved_place_collection_items') IS NULL THEN
        RAISE EXCEPTION 'PB16 collection tables are missing; migration 010 stopped';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.saved_place_collection_items AS item
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.pois AS poi
            WHERE poi.poi_id = item.poi_id
        )
    ) THEN
        RAISE EXCEPTION 'Orphan POI memberships found; migration 010 stopped without changing data';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.saved_place_collection_items'::regclass
          AND conname = 'fk_saved_place_collection_items_poi'
          AND (
              contype <> 'f'
              OR confrelid <> 'public.pois'::regclass
          )
    ) THEN
        RAISE EXCEPTION 'Constraint name fk_saved_place_collection_items_poi is already used by a different constraint';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.saved_place_collection_items'::regclass
          AND conname = 'fk_saved_place_collection_items_poi'
          AND contype = 'f'
          AND confrelid = 'public.pois'::regclass
    ) THEN
        ALTER TABLE public.saved_place_collection_items
            ADD CONSTRAINT fk_saved_place_collection_items_poi
            FOREIGN KEY (poi_id)
            REFERENCES public.pois(poi_id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.saved_place_collection_items
    VALIDATE CONSTRAINT fk_saved_place_collection_items_poi;

COMMIT;
