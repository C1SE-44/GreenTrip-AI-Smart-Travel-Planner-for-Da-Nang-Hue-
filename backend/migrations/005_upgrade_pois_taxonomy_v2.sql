-- Migration 005: Upgrade POIs Taxonomy V2 for AI & Multi-faceted Filtering
-- Adds sub_category, cuisine, budget_tier, vibes, best_time, eco_features, and ai_metadata JSONB

ALTER TABLE public.pois
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cuisine VARCHAR(50),
    ADD COLUMN IF NOT EXISTS budget_tier VARCHAR(10) DEFAULT '$$',
    ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS best_time TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS eco_features TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT '{}'::jsonb;

-- Indexes for lightning fast queries and AI recommendations
CREATE INDEX IF NOT EXISTS idx_pois_sub_category ON public.pois(sub_category);
CREATE INDEX IF NOT EXISTS idx_pois_cuisine ON public.pois(cuisine);
CREATE INDEX IF NOT EXISTS idx_pois_budget_tier ON public.pois(budget_tier);
CREATE INDEX IF NOT EXISTS idx_pois_vibes ON public.pois USING gin(vibes);
CREATE INDEX IF NOT EXISTS idx_pois_eco_features ON public.pois USING gin(eco_features);
CREATE INDEX IF NOT EXISTS idx_pois_ai_metadata ON public.pois USING gin(ai_metadata);
