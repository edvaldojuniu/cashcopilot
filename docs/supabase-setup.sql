-- ============================================
-- Cash Copilot — Supabase Database Setup
-- Execute este SQL no SQL Editor do Supabase
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Perfil do usuário com configurações
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  initial_balance DECIMAL(12,2) DEFAULT 0,
  cycle_start_day INTEGER DEFAULT 1 CHECK (cycle_start_day >= 1 AND cycle_start_day <= 28),
  show_daily_forecast BOOLEAN DEFAULT true,
  theme TEXT DEFAULT 'dark',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Entradas recorrentes (salário, renda extra, etc.)
CREATE TABLE income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saídas fixas recorrentes (contas com vencimento)
CREATE TABLE fixed_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gastos variáveis (categorias que compõem o Diário)
CREATE TABLE variable_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  monthly_amount DECIMAL(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cartões de crédito cadastrados
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dias marcados/verificados no diário
CREATE TABLE verified_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Faturas de cartão de crédito (com parcelas)
CREATE TABLE credit_card_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  card_name TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  start_month TEXT NOT NULL,  -- formato: '2026-01'
  end_month TEXT,             -- formato: '2026-12' (pode ser nulo para fixa)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lançamentos reais (gastos efetivos do dia)
CREATE TABLE daily_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'daily', 'card', 'saving')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Economia mensal
CREATE TABLE monthly_savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- ============================================
-- Row Level Security (RLS) — Cada usuário vê
-- APENAS seus próprios dados
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE variable_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_savings ENABLE ROW LEVEL SECURITY;

-- Profiles: usuário pode ler/escrever seu próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Income entries
CREATE POLICY "Users can view own income" ON income_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own income" ON income_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own income" ON income_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own income" ON income_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Fixed expenses
CREATE POLICY "Users can view own fixed expenses" ON fixed_expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fixed expenses" ON fixed_expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fixed expenses" ON fixed_expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own fixed expenses" ON fixed_expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Variable expenses
CREATE POLICY "Users can view own variable expenses" ON variable_expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own variable expenses" ON variable_expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own variable expenses" ON variable_expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own variable expenses" ON variable_expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Cards
CREATE POLICY "Users can view own cards" ON cards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cards" ON cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cards" ON cards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cards" ON cards
  FOR DELETE USING (auth.uid() = user_id);

-- Verified Days
CREATE POLICY "Users can view own verified days" ON verified_days
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verified days" ON verified_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own verified days" ON verified_days
  FOR DELETE USING (auth.uid() = user_id);

-- Credit card bills
CREATE POLICY "Users can view own card bills" ON credit_card_bills
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own card bills" ON credit_card_bills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own card bills" ON credit_card_bills
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own card bills" ON credit_card_bills
  FOR DELETE USING (auth.uid() = user_id);

-- Daily transactions
CREATE POLICY "Users can view own transactions" ON daily_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON daily_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON daily_transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON daily_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Monthly savings
CREATE POLICY "Users can view own savings" ON monthly_savings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings" ON monthly_savings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings" ON monthly_savings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings" ON monthly_savings
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Trigger: Criar perfil automaticamente ao
-- registrar novo usuário
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Indexes para performance
-- ============================================

CREATE INDEX idx_income_entries_user ON income_entries(user_id);
CREATE INDEX idx_fixed_expenses_user ON fixed_expenses(user_id);
CREATE INDEX idx_variable_expenses_user ON variable_expenses(user_id);
CREATE INDEX idx_credit_card_bills_user ON credit_card_bills(user_id);
CREATE INDEX idx_daily_transactions_user_date ON daily_transactions(user_id, date);
CREATE INDEX idx_monthly_savings_user ON monthly_savings(user_id, year, month);
