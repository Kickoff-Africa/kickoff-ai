-- WhatsApp chatbot: maps a WhatsApp number (E.164 digits, no "+") to an org
-- user, so WhatsApp chats are metered and audited like web chats, and keeps
-- the conversation each number is currently talking in.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user_id ON whatsapp_contacts(user_id);

-- Meta retries webhook deliveries; storing handled message ids makes
-- processing idempotent so a retry never produces a duplicate reply/charge.
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  wa_message_id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
