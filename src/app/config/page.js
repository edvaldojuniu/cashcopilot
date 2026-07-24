'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useFinance } from '@/contexts/FinanceContext';
import { useTheme } from '../providers';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav/BottomNav';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import styles from './page.module.css';
import { formatCurrency } from '@/lib/utils';

export default function ConfigPage() {
  const router = useRouter();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    incomeEntries, fixedExpenses, variableExpenses, cards, cardBills, tags,
    addIncomeEntry, updateIncomeEntry, deleteIncomeEntry,
    addFixedExpense, updateFixedExpense, deleteFixedExpense,
    addVariableExpense, updateVariableExpense, deleteVariableExpense,
    addCard, deleteCard, deleteTag, resetAccount,
  } = useFinance();

  const [activeTab, setActiveTab] = useState('geral');
  const [editingId, setEditingId] = useState(null);

  // General settings form
  const [initialBalance, setInitialBalance] = useState(profile?.initial_balance || 0);
  const [cycleStartDay, setCycleStartDay] = useState(profile?.cycle_start_day || 1);
  const [showDailyForecast, setShowDailyForecast] = useState(profile?.show_daily_forecast !== false);

  // Entry forms
  const [formData, setFormData] = useState({});

  // Conta (migrado de /menu)
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
      case 'income': {
        const now = new Date();
        const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Number(entry.due_day)).padStart(2, '0')}`;
        result = await addIncomeEntry({
          description: entry.description,
          amount: Number(entry.amount),
          frequency: 'monthly',
          start_date: startDate,
          end_date: null,
          is_active: true
        });
        break;
      }
      case 'fixed': {
        const now = new Date();
        const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Number(entry.due_day)).padStart(2, '0')}`;
        result = await addFixedExpense({
          description: entry.description,
          amount: Number(entry.amount),
          frequency: 'monthly',
          start_date: startDate,
          end_date: null, // por padrão, recorrente sem fim
          is_active: true
        });
        break;
      }
      case 'variable':
        result = await addVariableExpense({
          description: entry.description,
          monthly_amount: Number(entry.monthly_amount),
        });
        break;
      case 'card':
        result = await addCard({
          name: entry.card_name,
          description: entry.description || null,
          due_day: Number(entry.due_day),
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
      case 'card': await deleteCard(id); break;
      case 'tag': await deleteTag(id); break;
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await signOut(); // agora é instantâneo
    router.push('/');
  }

  async function handleResetAccount() {
    setIsResetting(true);
    try {
      const { error } = await resetAccount();
      if (error) {
        alert('Erro ao zerar a conta: ' + (error.message || 'tente novamente.'));
        return;
      }
      await updateProfile({
        initial_balance: 0,
        cycle_start_day: 1,
        show_daily_forecast: true,
      });
      setInitialBalance(0);
      setCycleStartDay(1);
      setShowDailyForecast(true);
      setResetModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao zerar a conta. Verifique sua conexão.');
    } finally {
      setIsResetting(false);
    }
  }

  async function handleDeleteAccount() {
    setIsDeletingAccount(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json();
      if (!res.ok) {
        alert('Erro ao excluir a conta: ' + (body.error || 'tente novamente.'));
        return;
      }
      await signOut();
      router.push('/');
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir a conta. Verifique sua conexão.');
    } finally {
      setIsDeletingAccount(false);
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
          <div className={`${styles.section} ${styles.stack}`}>
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

            {/* TAGS */}
            <div className="card">
              <h3 className={styles.sectionTitle}>
                Tags
                <span className={styles.badge}>{tags.length}</span>
              </h3>

              {tags.map((tag) => (
                <div key={tag.id} className={styles.listItem}>
                  <span className={styles.tagDot} style={{ background: tag.color }} />
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>{tag.name}</span>
                  </div>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('tag', tag.id)}>
                    ✕
                  </button>
                </div>
              ))}

              {tags.length === 0 && (
                <p className={styles.fieldHint}>
                  Nenhuma tag ainda — crie uma na tela de adicionar lançamento.
                </p>
              )}
            </div>

            {/* CONTA (migrado de Menu) */}
            <div className={`card ${styles.userCard}`}>
              <div className={styles.avatar}>
                {(profile?.name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{profile?.name || 'Usuário'}</span>
                <span className={styles.userEmail}>{user?.email}</span>
              </div>
            </div>

            <div className="card">
              <div className={styles.menuItem} onClick={toggleTheme} id="btn-toggle-theme">
                <span className={styles.menuIcon}>
                  {theme === 'dark' ? '🌙' : '☀️'}
                </span>
                <span className={styles.menuLabel}>
                  Tema {theme === 'dark' ? 'Escuro' : 'Claro'}
                </span>
                <span className={styles.menuAction}>
                  Trocar para {theme === 'dark' ? 'Claro' : 'Escuro'}
                </span>
              </div>
            </div>

            <div className="card">
              <div className={styles.infoSection}>
                <h3>Sobre o Cash Copilot</h3>
                <p>Gerenciador financeiro pessoal com previsão automatizada.</p>
                <p className={styles.version}>v1.0.0 MVP</p>
              </div>
            </div>

            <div className="card">
              <h3 className={styles.dangerTitle}>Zona de Risco</h3>

              <div
                className={`${styles.menuItem} ${styles.dangerItem}`}
                onClick={() => setResetModalOpen(true)}
                id="btn-reset-account"
              >
                <span className={styles.menuIcon}>♻️</span>
                <span className={styles.menuLabel}>Zerar minha conta</span>
                <span className={styles.menuAction}>Apagar tudo</span>
              </div>

              <div
                className={`${styles.menuItem} ${styles.dangerItem}`}
                onClick={() => setDeleteModalOpen(true)}
                id="btn-delete-account"
              >
                <span className={styles.menuIcon}>🗑️</span>
                <span className={styles.menuLabel}>Apagar minha conta</span>
                <span className={styles.menuAction}>Excluir</span>
              </div>
            </div>

            <button
              className={`btn btn-danger btn-full ${styles.logoutBtn}`}
              onClick={handleLogout}
              disabled={isLoggingOut}
              id="btn-logout"
            >
              {isLoggingOut ? 'Saindo...' : 'Sair da Conta'}
            </button>
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
                    <span className={styles.listMeta}>Dia {new Date(entry.start_date + 'T12:00:00').getDate()}</span>
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
                    <span className={styles.listMeta}>Dia {new Date(entry.start_date + 'T12:00:00').getDate()}</span>
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
                Seus Cartões de Crédito
                <span className={styles.badge}>{cards.length}</span>
              </h3>

              <p className={styles.fieldHint} style={{ marginBottom: '12px' }}>
                Cadastre cada cartão aqui. Os gastos no cartão são lançados pelo botão <strong>+</strong> na tela principal como &quot;Gasto no Cartão&quot;, e a fatura acumula automaticamente.
              </p>

              {cards.map((card) => (
                <div key={card.id} className={styles.listItem}>
                  <div className={styles.listInfo}>
                    <span className={styles.listName}>💳 {card.name}</span>
                    <span className={styles.listMeta}>
                      Vencimento: dia {card.due_day}
                      {card.description && ` · ${card.description}`}
                    </span>
                  </div>
                  <button className={styles.deleteBtn} onClick={() => handleDelete('card', card.id)}>
                    ✕
                  </button>
                </div>
              ))}

              {cards.length === 0 && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                  Nenhum cartão cadastrado ainda.
                </div>
              )}

              <div className={styles.addForm}>
                <h4 className={styles.addTitle}>Adicionar Cartão</h4>
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
                      placeholder="Dia de vencimento"
                      value={formData.due_day || ''}
                      onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                      min="1"
                      max="31"
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => handleAdd('card')}
                    disabled={!formData.card_name || !formData.due_day}
                  >
                    Adicionar Cartão
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav />

      <ConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleResetAccount}
        loading={isResetting}
        title="Zerar minha conta?"
        message={
          'Isso vai apagar TODAS as suas entradas, saídas, cartões, tags e lançamentos — inclusive o histórico do assistente.\n\nSua conta continua existindo, mas você volta pra configuração inicial. Essa ação não pode ser desfeita.'
        }
        confirmLabel="Sim, zerar tudo"
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
        loading={isDeletingAccount}
        title="Apagar minha conta?"
        message={
          'Isso exclui seu login e TODOS os seus dados permanentemente. Não tem como desfazer nem recuperar depois.'
        }
        confirmLabel="Excluir minha conta"
        requireText="EXCLUIR"
      />
    </div>
  );
}
