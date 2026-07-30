-- ============================================
-- Cash Copilot — Supabase Upgrade V10
-- Fechamento de fatura configurável por mês: o dia de fechamento de um
-- cartão de verdade não é fixo todo mês (pode mudar por fins de semana,
-- feriado, decisão do banco). Isso adiciona uma tabela de correções por
-- (cartão, mês) e uma coluna em movimentacoes pra compra avulsa/pagamento
-- de fatura dizer explicitamente a qual mês de fatura pertence, em vez de
-- só inferir por data.
-- Migração ADITIVA — não apaga nenhum dado existente.
-- Execute no SQL Editor.
-- ============================================

CREATE TABLE public.cartao_fechamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL, -- 'YYYY-MM', o mês da fatura (não o dia)
  data_fechamento DATE NOT NULL,
  UNIQUE (cartao_id, mes_referencia)
);
ALTER TABLE public.cartao_fechamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cartao_fechamentos" ON public.cartao_fechamentos FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can insert own cartao_fechamentos" ON public.cartao_fechamentos FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update own cartao_fechamentos" ON public.cartao_fechamentos FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own cartao_fechamentos" ON public.cartao_fechamentos FOR DELETE USING (auth.uid() = usuario_id);

ALTER TABLE public.movimentacoes ADD COLUMN fatura_ano_mes TEXT;

-- Backfill: compras avulsas de cartão e pagamentos de fatura já existentes
-- recebem o mês de fatura que a lógica de janela (dia do mês vs
-- cartoes.dia_fechamento) já assumia hoje — preserva exatamente onde cada
-- lançamento já aparecia antes desta migração.
UPDATE public.movimentacoes m
SET fatura_ano_mes = to_char(
  CASE WHEN EXTRACT(DAY FROM m.data_inicio)::int < c.dia_fechamento
    THEN m.data_inicio
    ELSE m.data_inicio + INTERVAL '1 month'
  END, 'YYYY-MM'
)
FROM public.cartoes c
WHERE m.cartao_id = c.id
  AND m.tipo IN ('card', 'invoice_payment')
  AND (m.tipo <> 'card' OR m.frequencia = 'none');
