-- Migration 015: Copilot conversation & message history per user and trip with Supabase RLS

BEGIN;

CREATE TABLE IF NOT EXISTS public.copilot_conversations (
    conversation_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    trip_id TEXT NOT NULL DEFAULT 'ideation',
    title TEXT NOT NULL DEFAULT '',
    trip_memory JSONB NOT NULL DEFAULT '{}'::jsonb,
    active_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_copilot_conversations_user_trip UNIQUE (user_id, trip_id),
    CONSTRAINT uq_copilot_conversations_user_conv UNIQUE (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user_trip
    ON public.copilot_conversations (user_id, trip_id);

CREATE TABLE IF NOT EXISTS public.copilot_messages (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_copilot_messages_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES public.copilot_conversations(conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_copilot_messages_user_conversation
        FOREIGN KEY (user_id, conversation_id)
        REFERENCES public.copilot_conversations(user_id, conversation_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_created
    ON public.copilot_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_user_id
    ON public.copilot_messages (user_id);

ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.copilot_conversations
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.copilot_messages
    FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.copilot_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.copilot_messages TO service_role;

DROP POLICY IF EXISTS copilot_conversations_owner_policy ON public.copilot_conversations;
CREATE POLICY copilot_conversations_owner_policy ON public.copilot_conversations
    FOR ALL TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS copilot_messages_owner_policy ON public.copilot_messages;
CREATE POLICY copilot_messages_owner_policy ON public.copilot_messages
    FOR ALL TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

COMMIT;
