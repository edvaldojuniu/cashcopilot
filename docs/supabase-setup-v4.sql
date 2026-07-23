-- ============================================
-- Cash Copilot — Supabase Upgrade V4
-- Execute no SQL Editor para habilitar histórico do assistente de IA
-- ============================================

CREATE TABLE public.assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assistant messages" ON public.assistant_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assistant messages" ON public.assistant_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own assistant messages" ON public.assistant_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_assistant_messages_user_created ON public.assistant_messages(user_id, created_at);
