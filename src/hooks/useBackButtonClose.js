'use client';

import { useEffect, useRef } from 'react';

/**
 * Faz o botão/gesto de voltar do celular fechar o modal em vez de sair da
 * tela por baixo dele. Enquanto o modal está aberto, empilha uma entrada de
 * histórico; "voltar" consome essa entrada (dispara popstate) e só fecha o
 * modal — a navegação real do app só acontece se não houver modal aberto.
 * Funciona empilhado (modal sobre modal) porque cada um empurra sua própria
 * entrada, então "voltar" sempre fecha o de cima primeiro.
 */
export function useBackButtonClose(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  // Mantém a ref atualizada sem mexer nela durante o render (regra do React).
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const pushedRef = useRef(false);
  const pushedPathRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    pushedPathRef.current = window.location.pathname + window.location.search;
    window.history.pushState({ cashCopilotModal: true }, '');
    pushedRef.current = true;

    function handlePopState() {
      pushedRef.current = false;
      onCloseRef.current();
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (pushedRef.current) {
        pushedRef.current = false;
        const samePath = window.location.pathname + window.location.search === pushedPathRef.current;
        // Só consome a entrada se ninguém navegou pra outra tela enquanto o
        // modal estava aberto (ex: trocou de aba pelo menu inferior) — senão
        // history.back() desfaria essa navegação por engano.
        if (samePath) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}
