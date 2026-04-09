-- ============================================
-- Cash Copilot — Supabase Upgrade V2
-- Execute no SQL Editor para habilitar Cartões e Checkmarks
-- ============================================

-- 1. Tabela de Cartões
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  closing_day INTEGER NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cards" ON public.cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.cards FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_cards_user ON public.cards(user_id);

-- 2. Tabela de Dias Verificados (Checkmarks)
CREATE TABLE public.verified_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.verified_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own verified days" ON public.verified_days FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own verified days" ON public.verified_days FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own verified days" ON public.verified_days FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_verified_days_user ON public.verified_days(user_id, date);

-- 3. Atualização das Transações e Faturas para suportar Cartões de Crédito Relacionais
ALTER TABLE public.daily_transactions ADD COLUMN card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.credit_card_bills ADD COLUMN card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE;

-- Atualiza restrição check de type de daily_transactions (evita erros se adicionarmos labels novas)
ALTER TABLE public.daily_transactions DROP CONSTRAINT IF EXISTS daily_transactions_type_check;

-- 4. Expansão de Assinaturas e Parcelas nas Saídas e Entradas
ALTER TABLE public.fixed_expenses ADD COLUMN start_month TEXT; -- ex: '2026-01'
ALTER TABLE public.fixed_expenses ADD COLUMN end_month TEXT;   -- null = infinita

ALTER TABLE public.income_entries ADD COLUMN start_month TEXT;
ALTER TABLE public.income_entries ADD COLUMN end_month TEXT;
