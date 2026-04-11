'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '../providers';
import BottomNav from '@/components/BottomNav/BottomNav';
import styles from './page.module.css';

export default function MenuPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  console.log('signOut type:', typeof signOut);
  const { theme, toggleTheme } = useTheme();

  async function handleLogout() {
    console.log('1. handleLogout chamado');
    console.log('2. signOut é:', typeof signOut, signOut);
    try {
      await signOut();
      console.log('3. signOut executou');
    } catch (e) {
      console.error('3. signOut deu erro:', e);
    }
    console.log('4. indo para /');
    router.push('/');
    router.refresh();
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

        {/* Logout */}
        <button className={`btn btn-danger btn-full ${styles.logoutBtn}`} onClick={handleLogout} id="btn-logout">
          Sair da Conta
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
