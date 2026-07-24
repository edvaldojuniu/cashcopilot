-- ============================================
-- Cash Copilot — Supabase Upgrade V7
-- Exceções de recorrência: permite editar/excluir só UMA ocorrência de uma
-- série (mensal/semanal/diária/parcelada) sem afetar o resto. Uma tabela
-- dedicada por tipo de template, mesmo padrão das tabelas de tags (FK real
-- + cascade automático em vez de uma tabela polimórfica).
-- Execute no SQL Editor.
-- ============================================

CREATE TABLE public.income_entry_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.income_entries(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (entry_id, exception_date)
);
ALTER TABLE public.income_entry_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own income_entry_exceptions" ON public.income_entry_exceptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own income_entry_exceptions" ON public.income_entry_exceptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own income_entry_exceptions" ON public.income_entry_exceptions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.fixed_expense_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (entry_id, exception_date)
);
ALTER TABLE public.fixed_expense_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own fixed_expense_exceptions" ON public.fixed_expense_exceptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fixed_expense_exceptions" ON public.fixed_expense_exceptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own fixed_expense_exceptions" ON public.fixed_expense_exceptions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.card_bill_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.credit_card_bills(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (entry_id, exception_date)
);
ALTER TABLE public.card_bill_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own card_bill_exceptions" ON public.card_bill_exceptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own card_bill_exceptions" ON public.card_bill_exceptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own card_bill_exceptions" ON public.card_bill_exceptions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.recurring_daily_entry_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.recurring_daily_entries(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (entry_id, exception_date)
);
ALTER TABLE public.recurring_daily_entry_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recurring_daily_entry_exceptions" ON public.recurring_daily_entry_exceptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring_daily_entry_exceptions" ON public.recurring_daily_entry_exceptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring_daily_entry_exceptions" ON public.recurring_daily_entry_exceptions FOR DELETE USING (auth.uid() = user_id);
