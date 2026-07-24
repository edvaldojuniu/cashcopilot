-- ============================================
-- Cash Copilot — Supabase Upgrade V8
-- Renomeia cards.due_day → cards.closing_day: o campo sempre representou o
-- dia em que a fatura fecha (não o vencimento em si), e o cálculo da fatura
-- já foi ajustado para casar com esse significado.
-- Execute no SQL Editor.
-- ============================================

ALTER TABLE public.cards RENAME COLUMN due_day TO closing_day;
