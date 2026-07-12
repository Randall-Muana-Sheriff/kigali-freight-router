-- Stores device push tokens (Firebase Cloud Messaging) per user so the
-- backend can notify drivers of new assignments even when the app isn't in
-- the foreground with a live socket connection. A user can have multiple
-- tokens (multiple devices); tokens are upserted on (re)registration and
-- removed when FCM reports them as invalid/unregistered.
CREATE TABLE IF NOT EXISTS push_tokens (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_username ON push_tokens (username);
