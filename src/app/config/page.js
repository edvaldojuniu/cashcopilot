'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import BottomNav from '@/components/BottomNav/BottomNav';
import styles from './page.module.css';
import { formatCurrency } from '@/lib/utils';

export default function ConfigPage() {
  const { profile, updateProfile, signOut } = useAuth();
  const {
    incomeEntries, fixedExpenses, variableExpenses, cardBills,
    addIncomeEntry, updateIncomeEntry, deleteIncomeEntry,
    addFixedExpense, updateFixedExpense, deleteFixedExpense,
    addVariableExpense, updateVariableExpense, deleteVariableExpense,
    addCardBill, updateCardBill, deleteCardBill,
  } = useFinance();

  const [activeTab, setActiveTab] = useState('geral');
  const [editingId, setEditingId] = useState(null);

  // General settings form
  const [initialBalance, setInitialBalance] = useState(profile?.initial_balance || 0);
  const [cycleStartDay, setCycleStartDay] = useState(profile?.cycle_start_day || 1);
  const [showDailyForecast, setShowDailyForecast] = useState(profile?.show_daily_forecast !== false);

  // Entry forms
  const [formData, setFormData] = useState({});

  async function handleSaveGeneral() {
    await updateProfile({
      initial_balance: Number(initialBalance),
      cycle_start_day: Number(cycleStartDay),
      show_daily_forecast: showDailyForecast,
    });
  }

  async function handleAdd(type) {
    const entry = { ...formData };
    let result;

    switch (type) {
      case 'income':
        result = await addIncomeEntry({
          description: entry.description,
          amount: Number(entry.amount),
          due_day: Number(entry.due_day),
          start_month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          end_month: null,
          is_active: true
        });
        break;
      case 'fixed':
        result = await addFixedExpense({
          description: entry.description,
          amount: Number(entry.amount),
          due_day: Number(entry.due_day),
          start_month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          end_month: null, // by default let's make it infinite here
          is_active: true
        });
        break;
      case 'variable':
        result = await addVariableExpense({
          description: entry.description,
          monthly_amount: Number(entry.monthly_amount),
        });
        break;
      case 'card':
        result = await addCardBill({
          card_name: entry.card_name,
          description: entry.description,
          amount: Number(entry.amount),
          due_day: Number(entry.due_day),
          start_month: entry.start_month,
          end_month: entry.end_month,
        });
        break;
    }

    if (!result?.error) {
      setFormData({});
    } else {
      alert("Erro ao salvar: " + (result.error.message || "Verifique se você rodou o script de configuração no Supabase."));
    }
  }

  async function handleDelete(type, id) {
    if (!confirm('Deseja remover este item?')) return;
    switch (type) {
      case 'income': await deleteIncomeEntry(id); break;
      case 'fixed': await deleteFixedExpense(id); break;
      case 'variable': await deleteVariableExpense(id); break;
      case 'card': await deleteCardBill(id); break;
    }
  }

  const tabs = [
    { key: 'geral', label: 'Geral' },
    { key: 'entradas', label: 'Entradas' },
    { key: 'saidas', label: 'Saídas' },
    { key: 'variaveis', label: 'Diário' },
    { key: 'cartoes', label: 'Cartões' },
  ];

  const totalVariaveis = variableExpenses
    .filter((e) => e.is_active !== false)
    .reduce((sum, e) => sum + Number(e.monthly_amount || 0), 0);

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dailyAmount = totalVariaveis / (daysInMonth || 30);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Configuração</h1>
      </header>

      <div className={styles.tabs} id="config-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
            id={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {/* GERAL */}
        {activeTab === 'geral' && (
          <div className={styles.section}>
            <div className="card">
              <h3 className={styles.sectionTitle}>Configurações Gerais</h3>

              <div className={styles.field}>
                <label className="label">Saldo Inicial (R$)</label>
                <input
                  type="number"
                  className="input"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  step="0.01"
                  id="input-initial-balance"
                />
                <span className={styles.fieldHint}>
                  Saldo atual da sua conta bancária (ponto de partida)
                </span>
              </div>

              <div className={styles.field}>
                <label className="label">Primeiro dia do ciclo</label>
                <input
                  type="number"
                  className="input"
                  value={cycleStartDay}
                  onChange={(e) => setCycleStartDay(e.target.value)}
                  min="1"
                  max="28"
                  id="input-cycle-day"
                />
                <span className={styles.fieldHint}>
                  Dia que inicia seu mês financeiro (ex: dia do salário). Default: 1
                </span>
              </div>

              <div className={styles.field}>
                <label className="label">Previsão de diário nos dias futuros</label>
                <div className={styles.toggle}>
                  <button
                    className={`${styles.toggleOption} ${showDailyForecast ? styles.toggleActive : ''}`}
                    onClick={() => setShowDailyForecast(true)}
                  >
                    Previsão
                  </button>
                  <button
                    className={`${styles.toggleOption} ${!showDailyForecast ? styles.toggleActive : ''}`}
                    onClick={() => setShowDailyForecast(false)}
                  >
                    R$ 0,00
                  </button>
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={handleSaveGeneral} id="btn-save-general">
                Salvar Configurações
              </button>
            </div>
          </div>
        )}

        {/* ENTRADAS */}
        {activeTab === 'entradas' && (
          <div className={styles.section}>
            <div className="card">
              <h3 className={styles.sectionTitle}>
                Entradas Recorrentes
                <span className={styles.badge}>{incomeEntries.length}</span>
              </h3>

              {incomeEntries.map((entry) => (
                <div key={entry.id} className={styles.listItem}>
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>{entry.description}</span>
                    <span className={styles.listMeta}>Dia {entry.due_day}</span>
                  </div>
                  <span className={`${styles.listAmount} currency-positive`}>
                    {formatCurrency(entry.amount)}
                  </span>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('income', entry.id)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className={styles.addForm}>
                <h4 className={styles.addTitle}>Adicionar Entrada</h4>
                <div className={styles.addFields}>
                  <input
                    className="input"
                    placeholder="Descrição (ex: Salário)"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <div className={styles.addRow}>
                    <input
                      className="input"
                      type="number"
                      placeholder="Valor"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      step="0.01"
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder="Dia"
                      value={formData.due_day || ''}
                      onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                      min="1"
                      max="31"
                    />
                  </div>
                  <button className="btn btn-primary btn-full" onClick={() => handleAdd('income')}>
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SAÍDAS FIXAS */}
        {activeTab === 'saidas' && (
          <div className={styles.section}>
            <div className="card">
              <h3 className={styles.sectionTitle}>
                Saídas Fixas
                <span className={styles.badge}>{fixedExpenses.length}</span>
              </h3>

              {fixedExpenses.map((entry) => (
                <div key={entry.id} className={styles.listItem}>
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>{entry.description}</span>
                    <span className={styles.listMeta}>Dia {entry.due_day}</span>
                  </div>
                  <span className={`${styles.listAmount} currency-negative`}>
                    {formatCurrency(entry.amount)}
                  </span>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('fixed', entry.id)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className={styles.addForm}>
                <h4 className={styles.addTitle}>Adicionar Saída Fixa</h4>
                <div className={styles.addFields}>
                  <input
                    className="input"
                    placeholder="Descrição (ex: Financiamento)"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <div className={styles.addRow}>
                    <input
                      className="input"
                      type="number"
                      placeholder="Valor"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      step="0.01"
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder="Dia vencimento"
                      value={formData.due_day || ''}
                      onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                      min="1"
                      max="31"
                    />
                  </div>
                  <button className="btn btn-primary btn-full" onClick={() => handleAdd('fixed')}>
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GASTOS VARIÁVEIS */}
        {activeTab === 'variaveis' && (
          <div className={styles.section}>
            <div className="card">
              <h3 className={styles.sectionTitle}>
                Gastos Variáveis (Diário)
                <span className={styles.badge}>{variableExpenses.length}</span>
              </h3>

              <div className={styles.dailySummary}>
                <div className={styles.dailyInfo}>
                  <span>Total mensal:</span>
                  <strong>{formatCurrency(totalVariaveis)}</strong>
                </div>
                <div className={styles.dailyInfo}>
                  <span>Diário ({daysInMonth} dias):</span>
                  <strong className={styles.dailyHighlight}>{formatCurrency(dailyAmount)}</strong>
                </div>
              </div>

              {variableExpenses.map((entry) => (
                <div key={entry.id} className={styles.listItem}>
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>{entry.description}</span>
                  </div>
                  <span className={styles.listAmount}>
                    {formatCurrency(entry.monthly_amount)}/mês
                  </span>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('variable', entry.id)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className={styles.addForm}>
                <h4 className={styles.addTitle}>Adicionar Gasto Variável</h4>
                <div className={styles.addFields}>
                  <input
                    className="input"
                    placeholder="Descrição (ex: Supermercado)"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Valor mensal"
                    value={formData.monthly_amount || ''}
                    onChange={(e) => setFormData({ ...formData, monthly_amount: e.target.value })}
                    step="0.01"
                  />
                  <button className="btn btn-primary btn-full" onClick={() => handleAdd('variable')}>
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CARTÕES */}
        {activeTab === 'cartoes' && (
          <div className={styles.section}>
            <div className="card">
              <h3 className={styles.sectionTitle}>
                Faturas de Cartão
                <span className={styles.badge}>{cardBills.length}</span>
              </h3>

              {cardBills.map((entry) => (
                <div key={entry.id} className={styles.listItem}>
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>{entry.card_name}</span>
                    <span className={styles.listMeta}>
                      {entry.description && `${entry.description} · `}
                      Dia {entry.due_day} · {entry.start_month} até {entry.end_month}
                    </span>
                  </div>
                  <span className={`${styles.listAmount} currency-negative`}>
                    {formatCurrency(entry.amount)}
                  </span>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('card', entry.id)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className={styles.addForm}>
                <h4 className={styles.addTitle}>Adicionar Fatura do Cartão</h4>
                <div className={styles.addFields}>
                  <input
                    className="input"
                    placeholder="Nome do cartão (ex: Nubank)"
                    value={formData.card_name || ''}
                    onChange={(e) => setFormData({ ...formData, card_name: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Descrição (opcional)"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <div className={styles.addRow}>
                    <input
                      className="input"
                      type="number"
                      placeholder="Valor parcela"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      step="0.01"
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder="Dia vencimento"
                      value={formData.due_day || ''}
                      onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                      min="1"
                      max="31"
                    />
                  </div>
                  <div className={styles.addRow}>
                    <div>
                      <label className="label">Mês início</label>
                      <input
                        className="input"
                        type="month"
                        value={formData.start_month || ''}
                        onChange={(e) => setFormData({ ...formData, start_month: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Mês fim</label>
                      <input
                        className="input"
                        type="month"
                        value={formData.end_month || ''}
                        onChange={(e) => setFormData({ ...formData, end_month: e.target.value })}
                      />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-full" onClick={() => handleAdd('card')}>
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
