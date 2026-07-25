-- ============================================
-- Cash Copilot — Supabase Upgrade V9
-- Unifica as 5 tabelas de movimento (income_entries, fixed_expenses,
-- credit_card_bills, recurring_daily_entries, daily_transactions) numa só
-- (movimentacoes) com coluna `tipo`, e traduz TODO o schema pra português.
-- ATENÇÃO: este script APAGA todos os dados de movimentação, tags, cartões,
-- gastos variáveis, dias verificados, metas e mensagens do assistente —
-- confirmado com o usuário que pode zerar (conta em uso recente).
-- Execute no SQL Editor.
-- ============================================

-- ── 1. Remove tudo que está sendo substituído ──────────────────────────────

DROP TABLE IF EXISTS public.income_entry_tags CASCADE;
DROP TABLE IF EXISTS public.income_entry_exceptions CASCADE;
DROP TABLE IF EXISTS public.income_entries CASCADE;

DROP TABLE IF EXISTS public.fixed_expense_tags CASCADE;
DROP TABLE IF EXISTS public.fixed_expense_exceptions CASCADE;
DROP TABLE IF EXISTS public.fixed_expenses CASCADE;

DROP TABLE IF EXISTS public.card_bill_tags CASCADE;
DROP TABLE IF EXISTS public.card_bill_exceptions CASCADE;
DROP TABLE IF EXISTS public.credit_card_bills CASCADE;

DROP TABLE IF EXISTS public.recurring_daily_entry_tags CASCADE;
DROP TABLE IF EXISTS public.recurring_daily_entry_exceptions CASCADE;
DROP TABLE IF EXISTS public.recurring_daily_entries CASCADE;

DROP TABLE IF EXISTS public.transaction_tags CASCADE;
DROP TABLE IF EXISTS public.daily_transactions CASCADE;

DROP TABLE IF EXISTS public.monthly_savings CASCADE;

-- ── 2. Renomeia tabelas/colunas que continuam existindo ────────────────────

ALTER TABLE public.profiles RENAME TO perfis;
ALTER TABLE public.perfis RENAME COLUMN name TO nome;
ALTER TABLE public.perfis RENAME COLUMN initial_balance TO saldo_inicial;
ALTER TABLE public.perfis RENAME COLUMN cycle_start_day TO dia_inicio_ciclo;
ALTER TABLE public.perfis RENAME COLUMN show_daily_forecast TO mostrar_previsao_diaria;
ALTER TABLE public.perfis RENAME COLUMN theme TO tema;
ALTER TABLE public.perfis RENAME COLUMN income_tag_id TO etiqueta_renda_id;
ALTER TABLE public.perfis RENAME COLUMN created_at TO criado_em;
ALTER TABLE public.perfis RENAME COLUMN updated_at TO atualizado_em;

ALTER TABLE public.cards RENAME TO cartoes;
ALTER TABLE public.cartoes RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.cartoes RENAME COLUMN name TO nome;
ALTER TABLE public.cartoes RENAME COLUMN description TO descricao;
ALTER TABLE public.cartoes RENAME COLUMN closing_day TO dia_fechamento;
ALTER TABLE public.cartoes RENAME COLUMN created_at TO criado_em;

ALTER TABLE public.variable_expenses RENAME TO gastos_variaveis;
ALTER TABLE public.gastos_variaveis RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.gastos_variaveis RENAME COLUMN description TO descricao;
ALTER TABLE public.gastos_variaveis RENAME COLUMN monthly_amount TO valor_mensal;
ALTER TABLE public.gastos_variaveis RENAME COLUMN is_active TO ativo;
ALTER TABLE public.gastos_variaveis RENAME COLUMN created_at TO criado_em;

ALTER TABLE public.verified_days RENAME TO dias_verificados;
ALTER TABLE public.dias_verificados RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.dias_verificados RENAME COLUMN date TO data;
ALTER TABLE public.dias_verificados RENAME COLUMN created_at TO criado_em;

ALTER TABLE public.tags RENAME TO etiquetas;
ALTER TABLE public.etiquetas RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.etiquetas RENAME COLUMN name TO nome;
ALTER TABLE public.etiquetas RENAME COLUMN color TO cor;
ALTER TABLE public.etiquetas RENAME COLUMN created_at TO criado_em;

ALTER TABLE public.period_goals RENAME TO metas_periodo;
ALTER TABLE public.metas_periodo RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.metas_periodo RENAME COLUMN period_start TO periodo_inicio;
ALTER TABLE public.metas_periodo RENAME COLUMN period_end TO periodo_fim;
ALTER TABLE public.metas_periodo RENAME COLUMN updated_at TO atualizado_em;

ALTER TABLE public.assistant_messages RENAME TO mensagens_assistente;
ALTER TABLE public.mensagens_assistente RENAME COLUMN user_id TO usuario_id;
ALTER TABLE public.mensagens_assistente RENAME COLUMN role TO papel;
ALTER TABLE public.mensagens_assistente RENAME COLUMN parts TO partes;
ALTER TABLE public.mensagens_assistente RENAME COLUMN created_at TO criado_em;

-- ── 3. Tabela unificada de movimentações ────────────────────────────────────

CREATE TABLE public.movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('income', 'expense', 'card', 'daily', 'saving', 'invoice_payment')),
  descricao TEXT,
  valor DECIMAL(12,2) NOT NULL,
  frequencia TEXT NOT NULL DEFAULT 'none' CHECK (frequencia IN ('none', 'monthly', 'weekly', 'daily', 'installment')),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now(),
  CHECK (tipo NOT IN ('card', 'invoice_payment') OR cartao_id IS NOT NULL)
);
CREATE INDEX idx_movimentacoes_usuario_data ON public.movimentacoes(usuario_id, data_inicio);
CREATE INDEX idx_movimentacoes_usuario_tipo ON public.movimentacoes(usuario_id, tipo);

ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own movimentacoes" ON public.movimentacoes FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can insert own movimentacoes" ON public.movimentacoes FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update own movimentacoes" ON public.movimentacoes FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own movimentacoes" ON public.movimentacoes FOR DELETE USING (auth.uid() = usuario_id);

CREATE TABLE public.movimentacao_etiquetas (
  movimentacao_id UUID NOT NULL REFERENCES public.movimentacoes(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES public.etiquetas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  PRIMARY KEY (movimentacao_id, etiqueta_id)
);
CREATE INDEX idx_movimentacao_etiquetas_movimentacao ON public.movimentacao_etiquetas(movimentacao_id);
CREATE INDEX idx_movimentacao_etiquetas_etiqueta ON public.movimentacao_etiquetas(etiqueta_id);
ALTER TABLE public.movimentacao_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own movimentacao_etiquetas" ON public.movimentacao_etiquetas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can insert own movimentacao_etiquetas" ON public.movimentacao_etiquetas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own movimentacao_etiquetas" ON public.movimentacao_etiquetas FOR DELETE USING (auth.uid() = usuario_id);

CREATE TABLE public.movimentacao_excecoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimentacao_id UUID NOT NULL REFERENCES public.movimentacoes(id) ON DELETE CASCADE,
  data_excecao DATE NOT NULL,
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  UNIQUE (movimentacao_id, data_excecao)
);
ALTER TABLE public.movimentacao_excecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own movimentacao_excecoes" ON public.movimentacao_excecoes FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can insert own movimentacao_excecoes" ON public.movimentacao_excecoes FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own movimentacao_excecoes" ON public.movimentacao_excecoes FOR DELETE USING (auth.uid() = usuario_id);

-- ── 4. Recria o trigger de criação automática de perfil ────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, saldo_inicial)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
