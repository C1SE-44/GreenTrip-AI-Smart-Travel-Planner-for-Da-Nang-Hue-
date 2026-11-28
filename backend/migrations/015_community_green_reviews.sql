BEGIN;

CREATE TABLE IF NOT EXISTS public.poi_environmental_reviews (
    review_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    poi_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    visit_reference TEXT NOT NULL,
    visit_verification_type TEXT NOT NULL
        CHECK (visit_verification_type = 'SELF_REPORTED_VISIT'),
    cleanliness_waste SMALLINT CHECK (cleanliness_waste BETWEEN 1 AND 5),
    single_use_plastic SMALLINT CHECK (single_use_plastic BETWEEN 1 AND 5),
    ecosystem_protection SMALLINT CHECK (ecosystem_protection BETWEEN 1 AND 5),
    responsible_management SMALLINT CHECK (responsible_management BETWEEN 1 AND 5),
    comment TEXT CHECK (comment IS NULL OR length(comment) <= 500),
    review_version INTEGER NOT NULL DEFAULT 1 CHECK (review_version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_poi_environmental_reviews_user_poi UNIQUE (user_id, poi_id)
);

CREATE INDEX IF NOT EXISTS idx_poi_environmental_reviews_poi
    ON public.poi_environmental_reviews (poi_id);

COMMIT;
