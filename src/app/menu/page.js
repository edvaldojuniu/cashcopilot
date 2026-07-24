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

export default function MenuPage() {
  const router = useRouter();
  const { user, profile, signOut, updateProfile } = useAuth();
  const { resetAccount } = useFinance();
  const { theme, toggleTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [isResetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
      setResetModalOpen(false);
      router.push('/config');
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Menu</h1>
      </header>

      <div className={styles.content}>
        {/* User info */}
        <div className={`card ${styles.userCard}`}>
          <div className={styles.avatar}>
            {(profile?.name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{profile?.name || 'Usuário'}</span>
            <span className={styles.userEmail}>{user?.email}</span>
          </div>
        </div>

        {/* Theme toggle */}
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

        {/* Info */}
        <div className="card">
          <div className={styles.infoSection}>
            <h3>Sobre o Cash Copilot</h3>
            <p>Gerenciador financeiro pessoal com previsão automatizada.</p>
            <p className={styles.version}>v1.0.0 MVP</p>
          </div>
        </div>

        {/* Zona de risco */}
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

        {/* Logout */}
        <button
          className={`btn btn-danger btn-full ${styles.logoutBtn}`}
          onClick={handleLogout}
          disabled={isLoggingOut} // ← desabilita após primeiro clique
          id="btn-logout"
        >
          {isLoggingOut ? 'Saindo...' : 'Sair da Conta'}
        </button>
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
