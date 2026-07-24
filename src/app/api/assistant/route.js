import { createClient } from '@supabase/supabase-js';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { buildAssistantTools } from '@/lib/assistant/tools';
import { buildSystemPrompt } from '@/lib/assistant/systemPrompt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Quantas mensagens (user+assistant) recentes mandar pro modelo a cada
// pergunta. O histórico completo fica salvo no banco para exibição, mas só
// as últimas N entram no contexto — sem isso o custo por pergunta cresceria
// sem limite conforme a conversa acumula ao longo do tempo.
const CONTEXT_MESSAGE_LIMIT = 20;

async function saveMessage(supabaseUser, userId, role, parts) {
  try {
    await supabaseUser.from('assistant_messages').insert({ user_id: userId, role, parts });
  } catch (err) {
    // Falha ao salvar histórico não deve derrubar a resposta do chat.
    console.error('[Assistant] falha ao salvar mensagem:', err);
  }
}

// Cria um client Supabase autenticado como o usuário da requisição (via o
// access token da sessão do browser, enviado no header Authorization).
// As policies de RLS se aplicam normalmente — sem precisar de service-role key.
function createUserSupabaseClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchFinanceData(supabaseUser, userId) {
  const results = await Promise.allSettled([
    supabaseUser.from('income_entries').select('*, income_entry_tags(tag_id)').eq('user_id', userId),
    supabaseUser.from('fixed_expenses').select('*, fixed_expense_tags(tag_id)').eq('user_id', userId),
    supabaseUser.from('variable_expenses').select('*').eq('user_id', userId),
    supabaseUser.from('cards').select('*').eq('user_id', userId),
    supabaseUser
      .from('daily_transactions')
      .select('*, transaction_tags(tag_id)')
      .eq('user_id', userId)
      .order('date'),
    supabaseUser.from('verified_days').select('*').eq('user_id', userId),
    supabaseUser.from('credit_card_bills').select('*, card_bill_tags(tag_id)').eq('user_id', userId),
    supabaseUser.from('tags').select('*').eq('user_id', userId),
    supabaseUser
      .from('recurring_daily_entries')
      .select('*, recurring_daily_entry_tags(tag_id)')
      .eq('user_id', userId),
  ]);

  const extract = (i) => {
    const r = results[i];
    return r.status === 'fulfilled' && !r.value.error ? r.value.data ?? [] : [];
  };

  // Achata a relação N:N de tags (transaction_tags / *_tags) num array
  // simples tag_ids — mesmo padrão do FinanceContext no client.
  const withFlatTagIds = (rows, joinKey) =>
    rows.map((r) => ({
      ...r,
      tag_ids: (r[joinKey] ?? []).map((j) => j.tag_id),
      [joinKey]: undefined,
    }));

  const transactions = withFlatTagIds(extract(4), 'transaction_tags');

  return {
    incomeEntries: withFlatTagIds(extract(0), 'income_entry_tags'),
    fixedExpenses: withFlatTagIds(extract(1), 'fixed_expense_tags'),
    variableExpenses: extract(2),
    cards: extract(3),
    transactions,
    verifiedDays: extract(5),
    cardBills: withFlatTagIds(extract(6), 'card_bill_tags'),
    tags: extract(7),
    recurringDailyEntries: withFlatTagIds(extract(8), 'recurring_daily_entry_tags'),
  };
}

export async function POST(req) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: 'Supabase não configurado no servidor.' },
      { status: 500 }
    );
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        error:
          'GOOGLE_GENERATIVE_AI_API_KEY não configurada. Gere uma chave em https://aistudio.google.com/apikey e adicione no .env.local.',
      },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    const supabaseUser = createUserSupabaseClient(accessToken);

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    const { data: profile } = await supabaseUser
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (!profile) {
      return Response.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    }

    const financeData = await fetchFinanceData(supabaseUser, user.id);

    const { messages } = await req.json();

    // A última mensagem recebida é sempre o novo turno do usuário (o client
    // manda o array acumulado inteiro a cada request) — só ela ainda não
    // está salva no banco.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user') {
      await saveMessage(supabaseUser, user.id, 'user', lastMessage.parts);
    }

    const todayStr = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const tools = {
      ...buildAssistantTools({
        supabaseUser,
        userId: user.id,
        financeData,
        profile,
      }),
      // Tool nativa do Google — a busca roda nos servidores do Google
      // (provider-executed), o modelo decide sozinho quando usar (ex: dicas
      // gerais de economia, contexto externo). Gemini 3 suporta combinar
      // essa tool nativa com as tools próprias acima na mesma conversa.
      google_search: google.tools.googleSearch({}),
    };

    const result = streamText({
      model: google('gemini-3.6-flash'),
      system: buildSystemPrompt({ profile, todayStr }),
      messages: await convertToModelMessages(messages.slice(-CONTEXT_MESSAGE_LIMIT)),
      tools,
      // Perguntas de conselho podem encadear busca + várias tools de dado +
      // resposta final — 5 passos era justo demais pra isso.
      stopWhen: stepCountIs(8),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onEnd: async ({ responseMessage }) => {
        await saveMessage(supabaseUser, user.id, 'assistant', responseMessage.parts);
      },
      // Sem isso, qualquer erro durante o streaming (ex: chave inválida,
      // limite do tier gratuito estourado) vira só "An error occurred."
      // genérico no client — aqui repassamos a mensagem real pra debugar.
      onError: (error) => {
        console.error('[Assistant] stream error:', error);
        return error instanceof Error ? error.message : String(error);
      },
    });
  } catch (err) {
    console.error('[Assistant] route error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro inesperado no assistente.' },
      { status: 500 }
    );
  }
}
