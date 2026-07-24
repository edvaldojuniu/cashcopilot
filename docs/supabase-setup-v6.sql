-- ============================================
-- Cash Copilot — Supabase Upgrade V6
-- Aba "Análises": metas por período + tag de renda
-- Execute no SQL Editor.
-- ============================================

-- Qual tag identifica renda mensal (usada só pra sugerir meta de economia
-- de 10-30% da renda). Opcional — sem configurar, a sugestão não aparece.
ALTER TABLE public.profiles ADD COLUMN income_tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL;

-- Metas de gasto/economia por período (ciclo financeiro do usuário).
-- Uma linha por período — editar sobrescreve (sem histórico de versões).
CREATE TABLE public.period_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  meta_gasto DECIMAL(12,2),
  meta_economia DECIMAL(12,2),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, period_start, period_end)
);

ALTER TABLE public.period_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own period goals" ON public.period_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own period goals" ON public.period_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own period goals" ON public.period_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own period goals" ON public.period_goals FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_period_goals_user ON public.period_goals(user_id, period_start);
