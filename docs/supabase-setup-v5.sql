-- ============================================
-- Cash Copilot — Supabase Upgrade V5
-- Repetição unificada (mensal/semanal/diário/parcelado) + tags em
-- templates recorrentes. Sistema ainda sem uso real — schema de
-- recorrência é redesenhado limpo em vez de só empilhar colunas.
-- Execute no SQL Editor.
-- ============================================

-- 1. income_entries: due_day/start_month/end_month → frequency/start_date/end_date
ALTER TABLE public.income_entries DROP COLUMN IF EXISTS due_day;
ALTER TABLE public.income_entries DROP COLUMN IF EXISTS start_month;
ALTER TABLE public.income_entries DROP COLUMN IF EXISTS end_month;
ALTER TABLE public.income_entries ADD COLUMN frequency TEXT NOT NULL DEFAULT 'none'
  CHECK (frequency IN ('none', 'monthly', 'weekly', 'daily', 'installment'));
ALTER TABLE public.income_entries ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.income_entries ADD COLUMN end_date DATE;
ALTER TABLE public.income_entries ALTER COLUMN start_date DROP DEFAULT;

-- 2. fixed_expenses: mesma troca
ALTER TABLE public.fixed_expenses DROP COLUMN IF EXISTS due_day;
ALTER TABLE public.fixed_expenses DROP COLUMN IF EXISTS start_month;
ALTER TABLE public.fixed_expenses DROP COLUMN IF EXISTS end_month;
ALTER TABLE public.fixed_expenses ADD COLUMN frequency TEXT NOT NULL DEFAULT 'none'
  CHECK (frequency IN ('none', 'monthly', 'weekly', 'daily', 'installment'));
ALTER TABLE public.fixed_expenses ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.fixed_expenses ADD COLUMN end_date DATE;
ALTER TABLE public.fixed_expenses ALTER COLUMN start_date DROP DEFAULT;

-- 3. credit_card_bills: mesma troca (frequency aqui só assume
--    none/monthly/installment na prática — a UI de Cartão não oferece
--    semanal/diário, mas o motor não precisa impor essa restrição)
ALTER TABLE public.credit_card_bills DROP COLUMN IF EXISTS due_day;
ALTER TABLE public.credit_card_bills DROP COLUMN IF EXISTS start_month;
ALTER TABLE public.credit_card_bills DROP COLUMN IF EXISTS end_month;
ALTER TABLE public.credit_card_bills ADD COLUMN frequency TEXT NOT NULL DEFAULT 'none'
  CHECK (frequency IN ('none', 'monthly', 'weekly', 'daily', 'installment'));
ALTER TABLE public.credit_card_bills ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.credit_card_bills ADD COLUMN end_date DATE;
ALTER TABLE public.credit_card_bills ALTER COLUMN start_date DROP DEFAULT;

-- 4. Templates recorrentes de Diário e Economia (não existiam — esses dois
--    tipos só geravam linha avulsa em daily_transactions)
CREATE TABLE public.recurring_daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'saving')),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'none' CHECK (frequency IN ('none', 'monthly', 'weekly', 'daily', 'installment')),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.recurring_daily_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recurring daily entries" ON public.recurring_daily_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring daily entries" ON public.recurring_daily_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring daily entries" ON public.recurring_daily_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring daily entries" ON public.recurring_daily_entries FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_recurring_daily_entries_user ON public.recurring_daily_entries(user_id);

-- 5. Tags para templates recorrentes — 4 tabelas dedicadas (não uma
--    polimórfica), cada uma espelhando transaction_tags com FK real e
--    cascade automático.
CREATE TABLE public.income_entry_tags (
  entry_id UUID NOT NULL REFERENCES public.income_entries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
ALTER TABLE public.income_entry_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own income_entry_tags" ON public.income_entry_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own income_entry_tags" ON public.income_entry_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own income_entry_tags" ON public.income_entry_tags FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.fixed_expense_tags (
  entry_id UUID NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
ALTER TABLE public.fixed_expense_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own fixed_expense_tags" ON public.fixed_expense_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fixed_expense_tags" ON public.fixed_expense_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own fixed_expense_tags" ON public.fixed_expense_tags FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.card_bill_tags (
  entry_id UUID NOT NULL REFERENCES public.credit_card_bills(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
ALTER TABLE public.card_bill_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own card_bill_tags" ON public.card_bill_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own card_bill_tags" ON public.card_bill_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own card_bill_tags" ON public.card_bill_tags FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.recurring_daily_entry_tags (
  entry_id UUID NOT NULL REFERENCES public.recurring_daily_entries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
ALTER TABLE public.recurring_daily_entry_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recurring_daily_entry_tags" ON public.recurring_daily_entry_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring_daily_entry_tags" ON public.recurring_daily_entry_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring_daily_entry_tags" ON public.recurring_daily_entry_tags FOR DELETE USING (auth.uid() = user_id);
