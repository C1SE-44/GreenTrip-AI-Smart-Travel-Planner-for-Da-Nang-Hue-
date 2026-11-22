-- Migration 018: DB 3NF Integrity Constraints, Strict UUID Foreign Keys, Search Indexes & Admin Audit Logs
-- Safe & 100% idempotent against existing production data in Supabase PostgreSQL.

-- 1. Enable pg_trgm for fast case-insensitive substring search (ILIKE '%...%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Search & Composite Filtering Indexes for 10,000+ concurrent user read scale
CREATE INDEX IF NOT EXISTS idx_pois_name_trgm
    ON public.pois USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pois_address_trgm
    ON public.pois USING gin (address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pois_city_category_active
    ON public.pois (city_id, category_id, is_active);

-- 3. Domain Integrity CHECK Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pois_green_score') THEN
        ALTER TABLE public.pois
            ADD CONSTRAINT chk_pois_green_score
            CHECK (green_score IS NULL OR (green_score >= 0 AND green_score <= 1));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pois_estimated_cost') THEN
        ALTER TABLE public.pois
            ADD CONSTRAINT chk_pois_estimated_cost
            CHECK (estimated_cost IS NULL OR estimated_cost >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pois_satisfaction_score') THEN
        ALTER TABLE public.pois
            ADD CONSTRAINT chk_pois_satisfaction_score
            CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 0 AND satisfaction_score <= 5));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pois_visit_minutes') THEN
        ALTER TABLE public.pois
            ADD CONSTRAINT chk_pois_visit_minutes
            CHECK (average_visit_minutes > 0 AND average_visit_minutes <= 1440);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT chk_users_role
            CHECK (UPPER(role) IN ('USER', 'ADMIN'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT chk_users_status
            CHECK (UPPER(status) IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'));
    END IF;
END
$$;

-- 4. Strict UUID Foreign Keys on Itineraries & Itinerary Stops (backward-compatible with Guest & Custom Stops)
ALTER TABLE public.itineraries
    ADD COLUMN IF NOT EXISTS owner_user_id UUID;

UPDATE public.itineraries i
SET owner_user_id = u.user_id
FROM public.users u
WHERE i.owner_user_id IS NULL
  AND i.user_id IS NOT NULL
  AND i.user_id = u.user_id::text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_itineraries_owner_user') THEN
        ALTER TABLE public.itineraries
            ADD CONSTRAINT fk_itineraries_owner_user
            FOREIGN KEY (owner_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_itineraries_owner_user_id
    ON public.itineraries (owner_user_id);

ALTER TABLE public.itinerary_stops
    ADD COLUMN IF NOT EXISTS poi_uuid UUID;

UPDATE public.itinerary_stops s
SET poi_uuid = p.poi_id
FROM public.pois p
WHERE s.poi_uuid IS NULL
  AND s.poi_id IS NOT NULL
  AND s.poi_id = p.poi_id::text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_itinerary_stops_poi_uuid') THEN
        ALTER TABLE public.itinerary_stops
            ADD CONSTRAINT fk_itinerary_stops_poi_uuid
            FOREIGN KEY (poi_uuid) REFERENCES public.pois(poi_id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_itinerary_stops_poi_uuid
    ON public.itinerary_stops (poi_uuid);

-- 5. 3NF Admin Audit Logs table for RBAC Governance (used in Phase 6)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    action VARCHAR(64) NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    target_id TEXT NOT NULL,
    changes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
    ON public.admin_audit_logs (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
    ON public.admin_audit_logs (target_table, target_id);
