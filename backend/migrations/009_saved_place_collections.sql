BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_place_collections (
    collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_saved_place_collections_name
        CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    CONSTRAINT uq_saved_place_collections_user_id
        UNIQUE (user_id, collection_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_place_collections_one_default
    ON public.saved_place_collections (user_id)
    WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_saved_place_collections_user_created
    ON public.saved_place_collections (user_id, is_default DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saved_place_collection_items (
    user_id UUID NOT NULL,
    collection_id UUID NOT NULL,
    poi_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_saved_place_collection_items
        PRIMARY KEY (collection_id, poi_id),
    CONSTRAINT fk_saved_place_collection_items_collection
        FOREIGN KEY (user_id, collection_id)
        REFERENCES public.saved_place_collections(user_id, collection_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_saved_place_collection_items_saved_place
        FOREIGN KEY (user_id, poi_id)
        REFERENCES public.saved_places(user_id, poi_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_place_collection_items_user_poi
    ON public.saved_place_collection_items (user_id, poi_id);

CREATE INDEX IF NOT EXISTS idx_saved_place_collection_items_user_collection
    ON public.saved_place_collection_items (user_id, collection_id);

ALTER TABLE public.saved_place_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_place_collection_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.saved_place_collections
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.saved_place_collection_items
    FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.saved_place_collections TO service_role;
GRANT SELECT, INSERT, DELETE
    ON TABLE public.saved_place_collection_items TO service_role;

-- Preserve existing Saved Places by copying their relationship into a default collection.
-- This does not update or delete any row in public.saved_places.
INSERT INTO public.saved_place_collections (user_id, name, is_default)
SELECT DISTINCT sp.user_id, 'Địa điểm của tôi', TRUE
FROM public.saved_places AS sp
ON CONFLICT (user_id) WHERE is_default DO NOTHING;

INSERT INTO public.saved_place_collection_items (user_id, collection_id, poi_id, created_at)
SELECT sp.user_id, c.collection_id, sp.poi_id, sp.created_at
FROM public.saved_places AS sp
JOIN public.saved_place_collections AS c
  ON c.user_id = sp.user_id
 AND c.is_default
ON CONFLICT (collection_id, poi_id) DO NOTHING;

COMMIT;
