-- Migration 019: Add transport_mode and custom_segment_modes for itinerary route persistence
-- Idempotent, zero-drop, backward-compatible.

BEGIN;

-- 1. Add transport_mode column to public.itinerary_stops (mode used to travel to/from this stop)
ALTER TABLE public.itinerary_stops ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(50);

-- 2. Add custom_segment_modes JSONB / TEXT column to public.itinerary_days to store per-segment custom overrides: {"0": "electric_bus", "1": "motorcycle"}
ALTER TABLE public.itinerary_days ADD COLUMN IF NOT EXISTS custom_segment_modes TEXT;

COMMIT;
