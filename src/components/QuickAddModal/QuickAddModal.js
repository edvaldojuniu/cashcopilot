'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './QuickAddModal.module.css';
import { useFinance } from '@/contexts/FinanceContext';
import TagPicker from '@/components/TagPicker/TagPicker';
import QuantityStepper from './QuantityStepper';
import RecurrenceScopeModal from '@/components/RecurrenceScopeModal/RecurrenceScopeModal';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { buildRecurrencePayload, diffMonths, diffDays, addDays } from '@/lib/recurrence';
import { formatCurrency } from '@/lib/utils';

const FULL_FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Não repete' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'installment', label: 'Parcelado' },
];

// Cartão não admite semanal/diário — só faz sentido casar fatura por mês.
const CARD_FREQUENCY_OPTIONS = [
  { value: 'none', label: 'Não repete' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'installment', label: 'Parcelado' },
];

const DATE_LABELS = {
  card: 'Data da Compra',
  income: 'Data da Entrada',
  expense: 'Data da Saída',
  diario: 'Data',
  saving: 'Data',
};

const RECURRING_END_TYPES = ['monthly', 'weekly', 'daily'];

// Valor do <select> de Tipo (espaço da UI) → valor da coluna `tipo` em
// movimentacoes (espaço do banco) — só "diario" precisa de tradução, o
// resto já bate 1:1.
function toDbType(uiType) {
  return uiType === 'diario' ? 'daily' : uiType;
}

export default function QuickAddModal({ isOpen, onClose, initialType = 'diario', editData = null, defaultDate = null }) {
  const { addMovement, updateMovement, deleteMovement, addMovementException, cards } = useFinance();

  useBackButtonClose(isOpen, onClose);

  const [type, setType] = useState(initialType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);

  const [cardId, setCardId] = useState('');
  const [tagIds, setTagIds] = useState([]);

  const [frequency, setFrequency] = useState('none'); // none, monthly, weekly, daily, installment
  const [endMode, setEndMode] = useState('infinite'); // infinite, count
  const [count, setCount] = useState(2);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeContext, setScopeContext] = useState('edit'); // 'edit' | 'delete'
  const amountInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        const editType = editData.type || initialType;
        setType(editType);
        // Compras no cartão salvam a descrição como "Descrição (Cartão)" — remove o
        // sufixo ao carregar para edição, senão ele se acumula a cada salvamento.
        const rawDesc = editData.description || '';
        setDescription(
          editType === 'card' ? rawDesc.replace(/ \([^)]*\)$/, '') : rawDesc
        );
        setTagIds(editData.tag_ids ?? []);
        if (editData.cartao_id) setCardId(editData.cartao_id);

        // Toda movimentação (entrada, saída, cartão, diário, economia) mora
        // hoje na mesma tabela — "avulso" é só frequencia === 'none', não
        // importa o tipo. Prefere a data da OCORRÊNCIA clicada (editData.date,
        // vinda do dia específico que o usuário abriu) sobre a data_inicio
        // original — isso é o que permite "atualizar esta e as próximas" a
        // partir de qualquer ponto da série, não só do início.
        const isOneOff = editData.frequencia === 'none';

        if (isOneOff) {
          setDate(editData.date);
          setAmount(editData.amount?.toString() || '');
          setFrequency('none');
          setEndMode('infinite');
          setCount(2);
        } else {
          const freq = editData.frequencia || 'none';
          const effectiveStartDate = editData.date || editData.data_inicio;
          const endDate = editData.data_fim;
          const rawAmount = Number(editData.amount) || 0;

          setDate(effectiveStartDate || new Date().toISOString().split('T')[0]);
          setFrequency(freq);

          if (freq === 'installment') {
            const n = effectiveStartDate && endDate ? diffMonths(effectiveStartDate, endDate) + 1 : 2;
            setCount(Math.max(n, 2));
            setEndMode('count');
            // O valor digitado originalmente era o TOTAL — reconstrói pra edição.
            setAmount((rawAmount * n).toString());
          } else if (freq === 'none' || !endDate) {
            setAmount(rawAmount.toString());
            setEndMode('infinite');
            setCount(2);
          } else {
            let n;
            if (freq === 'monthly') n = diffMonths(effectiveStartDate, endDate) + 1;
            else if (freq === 'weekly') n = Math.round(diffDays(effectiveStartDate, endDate) / 7) + 1;
            else n = diffDays(effectiveStartDate, endDate) + 1; // daily
            setCount(Math.max(n, 2));
            setEndMode('count');
            setAmount(rawAmount.toString());
          }
        }
      } else {
        setType(initialType);
        setDescription('');
        setAmount('');
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setFrequency('none');
        setEndMode('infinite');
        setCount(2);
        setTagIds([]);
        if (cards.length > 0) setCardId(cards[0].id);
      }
      // O componente fica montado mesmo fechado (só retorna null), então
      // autoFocus não dispara de novo a cada reabertura — foca manualmente.
      amountInputRef.current?.focus();
    }
  }, [isOpen, initialType, editData, cards, defaultDate]);

  if (!isOpen) return null;

  function handleTypeChange(newType) {
    setType(newType);
    // Cartão não admite semanal/diário — se veio de outro tipo com uma
    // dessas escolhidas, volta pro padrão.
    if (newType === 'card' && (frequency === 'weekly' || frequency === 'daily')) {
      setFrequency('none');
    }
    // Trocar PRA cartão a partir de outro tipo (ex: editando uma Saída Fixa
    // e mudando pra Cartão) — cardId nunca foi preenchido nesse caso (só é
    // populado a partir de editData.cartao_id ou ao abrir um lançamento novo
    // já como cartão), então ficava "" e ia assim pro banco, quebrando o
    // INSERT/UPDATE com "invalid input syntax for type uuid".
    if (newType === 'card' && !cardId && cards.length > 0) {
      setCardId(cards[0].id);
    }
  }

  // Toda movimentação vive na mesma tabela agora — "recorrente" é só
  // frequencia !== 'none', vale igual pros 5 tipos.
  function isRecurringEdit() {
    return !!editData && editData.frequencia !== 'none';
  }

  // "Somente esta": marca a ocorrência original como exceção (some da série)
  // e cria uma movimentação avulsa (frequencia 'none') só nessa data, já com
  // os valores editados.
  async function saveOnlyThisOccurrence(base) {
    const occurrenceDate = editData.date || editData.data_inicio;
    const { error: excError } = await addMovementException(editData.id, occurrenceDate);
    if (excError) return { error: excError };
    return addMovement({ ...base, frequencia: 'none', data_inicio: date, data_fim: date });
  }

  // "Esta e as próximas": se for a primeira ocorrência da série, é só uma
  // edição normal da linha inteira. Senão, trunca a original até o dia
  // anterior (preserva o passado) e cria uma nova a partir daqui.
  async function saveThisAndFuture(base, recurrencePayload) {
    const occurrenceDate = date;
    if (occurrenceDate === editData.data_inicio) {
      return updateMovement(editData.id, { ...base, ...recurrencePayload });
    }
    const truncateResult = await updateMovement(editData.id, { data_fim: addDays(occurrenceDate, -1) });
    if (truncateResult.error) return truncateResult;
    return addMovement({ ...base, ...recurrencePayload });
  }

  async function performSave(scopeChoice) {
    setIsSubmitting(true);

    if (type === 'card' && cards.length === 0) {
      alert('Você não possui cartões cadastrados. Vá em Config → Cartões.');
      setIsSubmitting(false);
      return;
    }
    if (type === 'card' && !cardId) {
      alert('Selecione um cartão.');
      setIsSubmitting(false);
      return;
    }

    const val = parseFloat(amount.replace(',', '.'));
    const isEdit = !!editData;
    const finalAmount = frequency === 'installment' ? val / count : val;
    const isOneOffCard = type === 'card' && frequency === 'none';
    const cardName = cards.find(c => c.id === cardId)?.nome || 'Cartão';
    // Compra avulsa de cartão ganha o nome do cartão embutido na descrição
    // (mesma convenção de sempre); fatura recorrente/parcelada não.
    const finalDescription = isOneOffCard ? `${description} (${cardName})` : description;

    const base = {
      tipo: toDbType(type),
      descricao: finalDescription,
      valor: finalAmount,
      cartao_id: type === 'card' ? cardId : null,
      ativo: true,
      tagIds,
    };
    const recurrencePayload = buildRecurrencePayload({ frequency, endMode, count, date });

    let result;
    try {
      if (!isEdit || !scopeChoice) {
        result = isEdit
          ? await updateMovement(editData.id, { ...base, ...recurrencePayload })
          : await addMovement({ ...base, ...recurrencePayload });
      } else if (scopeChoice === 'only') {
        result = await saveOnlyThisOccurrence(base);
      } else {
        result = await saveThisAndFuture(base, recurrencePayload);
      }

      if (result?.error) {
        console.error('[QuickAddModal] save failed:', result.error);
        alert('Erro ao salvar: ' + (result.error.message || 'verifique os dados e tente novamente.'));
        return;
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
      setScopeModalOpen(false);
    }
  }

  async function performRecurringDelete(scopeChoice) {
    const occurrenceDate = editData.date || editData.data_inicio;
    if (scopeChoice === 'only') {
      return addMovementException(editData.id, occurrenceDate);
    }
    // 'future'
    if (occurrenceDate === editData.data_inicio) {
      return deleteMovement(editData.id);
    }
    return updateMovement(editData.id, { data_fim: addDays(occurrenceDate, -1) });
  }

  async function performDelete(scopeChoice) {
    setIsDeleting(true);
    try {
      const result = scopeChoice
        ? await performRecurringDelete(scopeChoice)
        : await deleteMovement(editData.id);

      if (result?.error) {
        console.error('[QuickAddModal] delete failed:', result.error);
        alert('Erro ao excluir: ' + (result.error.message || 'tente novamente.'));
        return;
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir. Verifique sua conexão.');
    } finally {
      setIsDeleting(false);
      setScopeModalOpen(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Trocar o tipo é sempre uma edição de linha inteira (não existe "só
    // esta ocorrência" pra uma mudança de tipo) — pula o modal de escopo.
    const typeChanged = !!editData && editData.type !== type;
    if (!typeChanged && isRecurringEdit()) {
      setScopeContext('edit');
      setScopeModalOpen(true);
      return;
    }
    await performSave(null);
  }

  async function handleDelete() {
    if (!editData) return;
    if (isRecurringEdit()) {
      setScopeContext('delete');
      setScopeModalOpen(true);
      return;
    }
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    await performDelete(null);
  }

  async function handleScopeChoice(choice) {
    if (scopeContext === 'edit') await performSave(choice);
    else await performDelete(choice);
  }

  const frequencyOptions = type === 'card' ? CARD_FREQUENCY_OPTIONS : FULL_FREQUENCY_OPTIONS;
  const showEndModeSelect = RECURRING_END_TYPES.includes(frequency);
  const showStepper = frequency === 'installment' || (RECURRING_END_TYPES.includes(frequency) && endMode === 'count');

  const rawTotal = parseFloat((amount || '0').replace(',', '.')) || 0;
  const stepperLabel = frequency === 'installment'
    ? `${count} de ${formatCurrency(rawTotal)}/${count}`
    : `${count} de ${formatCurrency(rawTotal)}`;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>{editData ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.formContainer}>

          <div className={styles.formGroup}>
            <label>Tipo</label>
            <select value={type} onChange={e => handleTypeChange(e.target.value)}>
              <option value="diario">Gasto no Dia-a-Dia</option>
              <option value="saving">Economia (Retirada)</option>
              <option value="card">Gasto no Cartão de Crédito</option>
              <option value="expense">Saída Fixa (Mês a Mês)</option>
              <option value="income">Entrada (Dinheiro novo)</option>
            </select>
          </div>

          <div className={styles.valueGroup}>
             <span className={styles.currency}>R$</span>
             <input ref={amountInputRef} type="number" step="0.01" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>

          <div className={styles.formGroup}>
            <label>Descrição</label>
            <input type="text" required value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Mercado, Uber, Salário..." />
          </div>

          <div className={styles.formGroup}>
            <label>{DATE_LABELS[type]}</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {type === 'card' && (
            <div className={styles.formGroup}>
              <label>Cartão</label>
              <select value={cardId} onChange={e => setCardId(e.target.value)} required>
                {cards.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Repetição</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              {frequencyOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {showEndModeSelect && (
            <div className={styles.formGroup}>
              <label>Duração</label>
              <select value={endMode} onChange={e => setEndMode(e.target.value)}>
                <option value="infinite">Recorrente (sem fim)</option>
                <option value="count">Número de repetições</option>
              </select>
            </div>
          )}

          {showStepper && (
            <div className={styles.formGroup}>
              <label>Quantidade</label>
              <QuantityStepper count={count} onChange={setCount} label={stepperLabel} />
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Tags</label>
            <TagPicker selectedIds={tagIds} onChange={setTagIds} />
          </div>

          <div className={styles.actionsRow}>
            {editData && (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || isDeleting}>
              {isSubmitting ? 'Salvando...' : editData ? 'Salvar Alterações' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      <RecurrenceScopeModal
        isOpen={isScopeModalOpen}
        onClose={() => setScopeModalOpen(false)}
        onChooseOnly={() => handleScopeChoice('only')}
        onChooseFuture={() => handleScopeChoice('future')}
        actionLabel={scopeContext === 'delete' ? 'Excluir' : 'Atualizar'}
        loading={isSubmitting || isDeleting}
      />
    </div>
  );
}
