BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_path TEXT;

COMMENT ON COLUMN public.users.avatar_path IS
    'Private Supabase Storage object path for the user avatar; never a base64 image.';

COMMIT;
