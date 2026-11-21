-- Migration 017: Create public Supabase Storage bucket 'poi-images' for self-hosted POI photos
-- Safe on non-Supabase PostgreSQL instances (checks storage schema before creating).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage'
          AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'poi-images',
            'poi-images',
            TRUE,
            5242880,
            ARRAY['image/jpeg', 'image/png', 'image/webp']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = TRUE,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage'
          AND table_name = 'objects'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Public read access for poi-images'
    ) THEN
        CREATE POLICY "Public read access for poi-images"
            ON storage.objects
            FOR SELECT
            TO public
            USING (bucket_id = 'poi-images');
    END IF;
END $$;
