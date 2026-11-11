BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_place_collections (
    collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_saved_place_collections_name CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    CONSTRAINT uq_saved_place_collections_user_id UNIQUE (user_id, collection_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_place_collections_one_default
    ON public.saved_place_collections (user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_saved_place_collections_user_created
    ON public.saved_place_collections (user_id, is_default DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saved_place_collection_items (
    user_id UUID NOT NULL,
    collection_id UUID NOT NULL,
    poi_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_saved_place_collection_items PRIMARY KEY (collection_id, poi_id),
    CONSTRAINT fk_saved_place_collection_items_collection
        FOREIGN KEY (user_id, collection_id)
        REFERENCES public.saved_place_collections(user_id, collection_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_place_collection_items_user_poi
    ON public.saved_place_collection_items (user_id, poi_id);
CREATE INDEX IF NOT EXISTS idx_saved_place_collection_items_user_collection
    ON public.saved_place_collection_items (user_id, collection_id);

DO $$
DECLARE
    legacy_saved_places regclass := to_regclass('public.saved_places');
    old_constraint RECORD;
BEGIN
    IF legacy_saved_places IS NOT NULL THEN
        INSERT INTO public.saved_place_collections (user_id, name, is_default)
        SELECT DISTINCT saved.user_id, 'Địa điểm của tôi', TRUE
        FROM public.saved_places AS saved
        ON CONFLICT (user_id) WHERE is_default DO NOTHING;

        INSERT INTO public.saved_place_collection_items (user_id, collection_id, poi_id, created_at)
        SELECT saved.user_id, collection.collection_id, saved.poi_id,
               COALESCE(to_jsonb(saved) ->> 'saved_at', to_jsonb(saved) ->> 'created_at', NOW()::text)::timestamptz
        FROM public.saved_places AS saved
        JOIN public.saved_place_collections AS collection
          ON collection.user_id = saved.user_id AND collection.is_default
        ON CONFLICT (collection_id, poi_id) DO NOTHING;
    END IF;

    IF to_regclass('public.saved_place_collection_items') IS NOT NULL
       AND legacy_saved_places IS NOT NULL THEN
        FOR old_constraint IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.saved_place_collection_items'::regclass
              AND contype = 'f' AND confrelid = legacy_saved_places
        LOOP
            EXECUTE format('ALTER TABLE public.saved_place_collection_items DROP CONSTRAINT %I', old_constraint.conname);
        END LOOP;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.saved_place_collection_items'::regclass
          AND conname = 'fk_saved_place_collection_items_poi'
          AND contype = 'f' AND confrelid = 'public.pois'::regclass
    ) THEN
        ALTER TABLE public.saved_place_collection_items
            ADD CONSTRAINT fk_saved_place_collection_items_poi
            FOREIGN KEY (poi_id) REFERENCES public.pois(poi_id) ON DELETE CASCADE NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.saved_place_collection_items
    VALIDATE CONSTRAINT fk_saved_place_collection_items_poi;

ALTER TABLE public.saved_place_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_place_collection_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.saved_place_collections
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.saved_place_collection_items
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_place_collections TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.saved_place_collection_items TO service_role;

COMMIT;
