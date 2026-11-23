-- REVIEW ONLY: not applied online; verify backend table ownership/BYPASSRLS first.
-- Custom FastAPI JWT: clients use authenticated FastAPI routes, not Supabase Data API.
BEGIN;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_stops ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.itineraries, public.itinerary_days, public.itinerary_stops FROM anon, authenticated;
COMMIT;

SELECT c.relname, c.relrowsecurity,
  has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    OR has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS public_client_access
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('itineraries','itinerary_days','itinerary_stops');
