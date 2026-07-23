'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import styles from './AssistantWidget.module.css';

// Executado a cada envio de mensagem (fora do callback onAuthStateChange),
// nunca dentro dele — evita o deadlock conhecido do client Supabase.
async function getAuthHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const BUSY_STATUSES = ['streaming', 'submitted'];

// Tools que gravam no Supabase por fora do FinanceContext — depois de uma
// dessas ter sucesso, o estado local precisa ser sincronizado, senão a
// tela só reflete o novo dado depois de um F5.
const WRITE_TOOL_TYPES = ['tool-confirmTransaction', 'tool-createTag'];

// Quantas mensagens salvas carregar ao abrir o app — mantém a consulta leve
// mesmo depois de meses de uso.
const HISTORY_LOAD_LIMIT = 50;

export default function AssistantWidget() {
  const { isAuthenticated, user, sessionReady } = useAuth();
  const { refetchSilent } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const syncedToolCallIds = useRef(new Set());
  const historyLoadedRef = useRef(false);

  const [transport] = useState(
    () => new DefaultChatTransport({ api: '/api/assistant', headers: getAuthHeaders })
  );
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    onError: (err) => console.error('[Assistant]', err),
  });

  const isBusy = BUSY_STATUSES.includes(status);

  useBackButtonClose(isOpen, () => setIsOpen(false));

  // Carrega o histórico salvo uma única vez por sessão, assim que a auth
  // estiver pronta — não fica escrevendo/lendo repetidamente.
  useEffect(() => {
    if (!supabase || !user || !sessionReady || historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    (async () => {
      const { data } = await supabase
        .from('assistant_messages')
        .select('id, role, parts')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LOAD_LIMIT);

      if (data && data.length > 0) {
        setMessages(data.reverse().map((row) => ({ id: row.id, role: row.role, parts: row.parts })));
      }
    })();
  }, [user, sessionReady, setMessages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Sincroniza o FinanceContext assim que uma tool de escrita termina com
  // sucesso, para o lançamento aparecer na tela sem precisar recarregar.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          WRITE_TOOL_TYPES.includes(part.type) &&
          part.state === 'output-available' &&
          part.output?.created &&
          !syncedToolCallIds.current.has(part.toolCallId)
        ) {
          syncedToolCallIds.current.add(part.toolCallId);
          refetchSilent();
        }
      }
    }
  }, [messages, refetchSilent]);

  if (!isAuthenticated) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input.trim() });
    setInput('');
  }

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Assistente financeiro"
      >
        {isOpen ? '×' : '💬'}
      </button>

      {isOpen && (
        <>
          {/* Transparente — só existe pra capturar o toque fora e fechar,
              sem deixar esse mesmo toque "vazar" pra tabela por baixo. */}
          <div
            className={styles.outsideCatcher}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className={styles.panel}>
          <div className={styles.header}>
            <span>Assistente Cash Copilot</span>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.length === 0 && (
              <div className={styles.emptyState}>
                Pergunte sobre seus gastos, faturas ou peça dicas de economia.
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${
                  message.role === 'user' ? styles.messageUser : styles.messageAssistant
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return <p key={i}>{part.text}</p>;
                  }

                  if (
                    part.type === 'tool-proposeTransaction' &&
                    part.state === 'output-available' &&
                    part.output?.proposal
                  ) {
                    const p = part.output.proposal;
                    return (
                      <div key={i} className={styles.confirmCard}>
                        <div className={styles.confirmTitle}>Confirmar lançamento?</div>
                        <div className={styles.confirmRow}>
                          {p.description || '(sem descrição)'}
                        </div>
                        <div className={styles.confirmRow}>
                          {formatCurrency(p.amount)} · {p.date}
                        </div>
                        <div className={styles.confirmActions}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={isBusy}
                            onClick={() => sendMessage({ text: 'Não, cancele esse lançamento.' })}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={isBusy}
                            onClick={() => sendMessage({ text: 'Sim, confirmo esse lançamento.' })}
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ))}

            {isBusy && <div className={styles.typing}>Pensando...</div>}

            {error && (
              <div className={styles.errorBanner}>
                Deu erro ao falar com o assistente: {error.message || 'tente novamente.'}
              </div>
            )}
          </div>

          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              placeholder="Pergunte algo..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isBusy}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!input.trim() || isBusy}
              aria-label="Enviar"
            >
              ➤
            </button>
          </form>
          </div>
        </>
      )}
    </>
  );
}
