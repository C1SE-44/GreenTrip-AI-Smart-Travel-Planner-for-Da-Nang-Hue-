-- Migration 008: Create itineraries, itinerary_days, and itinerary_stops tables
-- Aligned with GreenTrip AI Sprint 3 Database Specification

CREATE TABLE IF NOT EXISTS public.itineraries (
    itinerary_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(100) DEFAULT 'Đà Nẵng & Huế',
    total_days SMALLINT NOT NULL DEFAULT 1,
    total_cost NUMERIC(12, 2) DEFAULT 0,
    total_carbon_co2e NUMERIC(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.itinerary_days (
    itinerary_day_id VARCHAR(64) PRIMARY KEY,
    itinerary_id VARCHAR(64) NOT NULL REFERENCES public.itineraries(itinerary_id) ON DELETE CASCADE,
    day_number SMALLINT NOT NULL,
    theme VARCHAR(255),
    focus_city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_itinerary_day UNIQUE (itinerary_id, day_number)
);

CREATE TABLE IF NOT EXISTS public.itinerary_stops (
    itinerary_stop_id VARCHAR(64) PRIMARY KEY,
    itinerary_day_id VARCHAR(64) NOT NULL REFERENCES public.itinerary_days(itinerary_day_id) ON DELETE CASCADE,
    poi_id VARCHAR(64) NOT NULL,
    sequence_no SMALLINT NOT NULL,
    time_slot VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_day_sequence UNIQUE (itinerary_day_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_days_itin_id ON public.itinerary_days(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_stops_day_id ON public.itinerary_stops(itinerary_day_id);
