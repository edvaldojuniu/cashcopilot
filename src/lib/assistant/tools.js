import { z } from 'zod';
import { tool } from 'ai';
import { computeMonthForecast, calculateTagTotals } from '@/lib/engine';

// Tipos que o assistente pode gravar via chat. Compra no cartão fica de fora
// do MVP — exige escolher card_id e mexe na lógica de fatura, mais arriscado
// para uma primeira versão de escrita por chat.
const WRITABLE_TYPES = ['daily', 'saving'];

function resolveTagIds(tagNames, tags) {
  const resolved = [];
  const unknown = [];
  (tagNames || []).forEach((name) => {
    const match = tags.find((t) => t.nome.toLowerCase() === String(name).toLowerCase());
    if (match) resolved.push(match.id);
    else unknown.push(name);
  });
  return { resolved, unknown };
}

/**
 * Monta o conjunto de tools (function calling) do assistente para uma única
 * requisição. `financeData` é o snapshot já buscado do Supabase (mesmas
 * tabelas que o FinanceContext busca no client — schema em português);
 * `supabaseUser` é um client autenticado como o usuário (RLS aplica
 * normalmente) para as tools de escrita. Desacoplado da rota Next de
 * propósito, para poder ser reutilizado por um futuro handler de webhook
 * (WhatsApp/Telegram) sem duplicar lógica.
 */
export function buildAssistantTools({ supabaseUser, userId, financeData, profile }) {
  const { movements, variableExpenses, cards, verifiedDays, tags } = financeData;

  const baseForecastParams = {
    movements,
    variableExpenses,
    cards,
    verifiedDays,
    showDailyForecast: profile.mostrar_previsao_diaria !== false,
    cycleStartDay: profile.dia_inicio_ciclo ?? 1,
  };

  function monthSummary(year, month) {
    return computeMonthForecast({
      ...baseForecastParams,
      year,
      month,
      initialBalance: profile.saldo_inicial,
    });
  }

  return {
    getMonthSummary: tool({
      description:
        'Retorna o resumo financeiro (entradas, saídas fixas, cartão, orçamento diário, economias, saldo final) de um mês específico, já respeitando o ciclo financeiro customizado do usuário.',
      inputSchema: z.object({
        year: z.number().int().describe('Ano, ex: 2026'),
        month: z
          .number()
          .int()
          .min(0)
          .max(11)
          .describe('Mês em índice 0-based (0=Janeiro, 11=Dezembro)'),
      }),
      execute: async ({ year, month }) => {
        const { summary, initialBalance } = monthSummary(year, month);
        const { logs, ...rest } = summary;
        return { initialBalance, ...rest };
      },
    }),

    getTagTotals: tool({
      description:
        'Retorna o total gasto em cada tag/categoria dentro do ciclo financeiro de um mês específico.',
      inputSchema: z.object({
        year: z.number().int(),
        month: z.number().int().min(0).max(11),
      }),
      execute: async ({ year, month }) => {
        const { summary } = monthSummary(year, month);
        return { tagTotals: calculateTagTotals(summary.logs || [], tags) };
      },
    }),

    getSpendingTrends: tool({
      description:
        'Compara o total gasto (geral, ou de uma tag/categoria específica) nos últimos N meses, mês a mês, pra identificar se está subindo ou caindo. Use pra responder perguntas como "qual gasto está aumentando mais" ou pra embasar um plano de economia com dados reais antes de opinar.',
      inputSchema: z.object({
        tagName: z
          .string()
          .optional()
          .describe('Nome da tag/categoria a comparar; se omitido, compara o custo de vida total (saídas fixas + diário + cartão)'),
        months: z
          .number()
          .int()
          .min(2)
          .max(12)
          .default(3)
          .describe('Quantos meses recentes comparar, incluindo o mês atual'),
      }),
      execute: async ({ tagName, months }) => {
        const tagFilter = tagName
          ? tags.find((t) => t.nome.toLowerCase() === tagName.toLowerCase())
          : null;
        if (tagName && !tagFilter) return { error: `Tag "${tagName}" não encontrada.` };

        const now = new Date();
        const series = [];
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const { summary } = monthSummary(d.getFullYear(), d.getMonth());
          const total = tagFilter
            ? calculateTagTotals(summary.logs || [], tags).find((t) => t.id === tagFilter.id)?.total || 0
            : summary.custoDeVida;
          series.push({ year: d.getFullYear(), month: d.getMonth(), total });
        }

        const first = series[0].total;
        const last = series[series.length - 1].total;
        const trendPercent = first === 0 ? null : Math.round(((last - first) / first) * 10000) / 100;

        return { series, trendPercent };
      },
    }),

    getTransactions: tool({
      description:
        'Lista lançamentos reais (gastos do dia a dia, economias, compras avulsas no cartão) em um intervalo de datas, opcionalmente filtrando por tag.',
      inputSchema: z.object({
        dateFrom: z.string().describe('Data inicial, formato YYYY-MM-DD'),
        dateTo: z.string().describe('Data final, formato YYYY-MM-DD'),
        tagName: z.string().optional().describe('Filtrar apenas lançamentos com essa tag'),
      }),
      execute: async ({ dateFrom, dateTo, tagName }) => {
        const tagFilter = tagName
          ? tags.find((t) => t.nome.toLowerCase() === tagName.toLowerCase())
          : null;
        // Só lançamentos avulsos (frequencia 'none') — templates recorrentes
        // são uma definição de série, não um evento datado; nunca entraram
        // aqui, mesmo antes da unificação.
        const items = movements
          .filter((m) => m.frequencia === 'none' && m.data_inicio >= dateFrom && m.data_inicio <= dateTo)
          .filter((m) => !tagFilter || (m.tag_ids || []).includes(tagFilter.id))
          .slice(0, 200)
          .map((m) => ({
            date: m.data_inicio,
            type: m.tipo,
            description: m.descricao,
            amount: Number(m.valor),
            tags: (m.tag_ids || [])
              .map((id) => tags.find((tg) => tg.id === id)?.nome)
              .filter(Boolean),
          }));
        return { count: items.length, items };
      },
    }),

    getCardBillDetail: tool({
      description:
        'Detalha a fatura de um cartão de crédito específico em um mês: total, itens que a compõem e quanto já foi pago.',
      inputSchema: z.object({
        cardName: z.string(),
        year: z.number().int(),
        month: z.number().int().min(0).max(11),
      }),
      execute: async ({ cardName, year, month }) => {
        const { forecast } = monthSummary(year, month);
        const matches = (e) =>
          e.type === 'card' && e.description?.toLowerCase().includes(cardName.toLowerCase());
        const day = forecast.find((d) => d.expenses.some(matches));
        const bill = day?.expenses.find(matches);
        if (!bill) return { found: false };
        return {
          found: true,
          dueDate: day.dateStr,
          total: bill.originalTotal,
          alreadyPaid: bill.alreadyPaid,
          remaining: bill.amount,
          items: (bill.items || []).map((i) => ({
            description: i.description,
            amount: Number(i.amount),
          })),
        };
      },
    }),

    createTag: tool({
      description:
        'Cria uma nova tag/categoria (nome + cor) para organizar lançamentos. Ação de baixo risco — pode ser feita sem confirmação explícita do usuário.',
      inputSchema: z.object({
        name: z.string(),
        color: z.string().describe('Cor em hexadecimal, ex: #58A6FF'),
      }),
      execute: async ({ name, color }) => {
        const { data, error } = await supabaseUser
          .from('etiquetas')
          .insert({ nome: name, cor: color, usuario_id: userId })
          .select()
          .single();
        if (error) return { error: error.message };
        tags.push(data);
        return { created: data };
      },
    }),

    proposeTransaction: tool({
      description:
        'Monta uma proposta de novo lançamento (gasto do dia a dia ou economia) para o usuário confirmar antes de gravar. NÃO grava nada — apenas formata os dados para revisão.',
      inputSchema: z.object({
        date: z.string().describe('Data do lançamento, formato YYYY-MM-DD'),
        amount: z.number().positive(),
        description: z.string(),
        type: z
          .enum(WRITABLE_TYPES)
          .describe('"daily" para gasto do dia a dia, "saving" para economia/retirada'),
        tagNames: z.array(z.string()).optional(),
      }),
      execute: async ({ date, amount, description, type, tagNames }) => {
        const { resolved, unknown } = resolveTagIds(tagNames, tags);
        return {
          proposal: { date, amount, description, type, tagIds: resolved },
          unknownTags: unknown,
        };
      },
    }),

    confirmTransaction: tool({
      description:
        'Grava de fato um lançamento (gasto do dia a dia ou economia) já proposto via proposeTransaction e EXPLICITAMENTE confirmado pelo usuário em uma mensagem anterior. Nunca chamar sem essa confirmação explícita.',
      inputSchema: z.object({
        date: z.string(),
        amount: z.number().positive(),
        description: z.string(),
        type: z.enum(WRITABLE_TYPES),
        tagNames: z.array(z.string()).optional(),
      }),
      execute: async ({ date, amount, description, type, tagNames }) => {
        const { resolved } = resolveTagIds(tagNames, tags);
        const { data, error } = await supabaseUser
          .from('movimentacoes')
          .insert({
            tipo: type,
            descricao: description,
            valor: amount,
            frequencia: 'none',
            data_inicio: date,
            data_fim: date,
            ativo: true,
            usuario_id: userId,
          })
          .select()
          .single();
        if (error) return { error: error.message };

        if (resolved.length > 0) {
          const { error: tagError } = await supabaseUser.from('movimentacao_etiquetas').insert(
            resolved.map((tagId) => ({
              movimentacao_id: data.id,
              etiqueta_id: tagId,
              usuario_id: userId,
            }))
          );
          if (tagError) return { created: data, tagError: tagError.message };
        }

        return { created: { ...data, tag_ids: resolved } };
      },
    }),
  };
}
