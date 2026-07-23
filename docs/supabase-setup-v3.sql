-- ============================================
-- Cash Copilot — Supabase Upgrade V3
-- Execute no SQL Editor para habilitar Tags nos lançamentos
-- ============================================

-- 1. Tabela de Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tags" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON public.tags FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_tags_user ON public.tags(user_id);

-- 2. Tabela de junção N:N entre lançamentos e tags
CREATE TABLE public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.daily_transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transaction_tags" ON public.transaction_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transaction_tags" ON public.transaction_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own transaction_tags" ON public.transaction_tags FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_transaction_tags_transaction ON public.transaction_tags(transaction_id);
CREATE INDEX idx_transaction_tags_tag ON public.transaction_tags(tag_id);
