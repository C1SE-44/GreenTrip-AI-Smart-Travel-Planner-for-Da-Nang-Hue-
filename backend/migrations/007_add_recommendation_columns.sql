-- Add recommendation features used by PB09, if they are not already present.
ALTER TABLE public.pois
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC,
    ADD COLUMN IF NOT EXISTS satisfaction_score FLOAT,
    ADD COLUMN IF NOT EXISTS is_local_business BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS local_business_type TEXT,
    ADD COLUMN IF NOT EXISTS green_score FLOAT DEFAULT 0.5,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
