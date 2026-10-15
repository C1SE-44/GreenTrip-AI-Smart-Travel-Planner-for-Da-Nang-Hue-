BEGIN;

-- Allow NULL password_hash for OAuth / Google SSO users who do not have a traditional password
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

COMMIT;
