'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import styles from './AuthScreen.module.css';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message);
      } else {
        if (password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, name);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Conta criada! Verifique seu email para confirmar.');
        }
      }
    } catch (err) {
      setError('Erro ao processar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.orb3} />
      </div>

      <div className={styles.content}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className={styles.title}>Cash Copilot</h1>
          <p className={styles.subtitle}>Gerenciador Financeiro Pessoal</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} id="auth-form">
          {mode === 'register' && (
            <div className={styles.field}>
              <label className="label" htmlFor="name">Nome</label>
              <input
                id="name"
                type="text"
                className="input"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.field}>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className="label" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>{success}</div>}

          <button
            type="submit"
            className={`btn btn-primary btn-full ${styles.submitBtn}`}
            disabled={loading}
            id="btn-auth-submit"
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : mode === 'login' ? (
              'Entrar'
            ) : (
              'Criar conta'
            )}
          </button>
        </form>

        <div className={styles.switchMode}>
          {mode === 'login' ? (
            <p>
              Não tem conta?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className={styles.link} id="btn-switch-register">
                Criar conta
              </button>
            </p>
          ) : (
            <p>
              Já tem conta?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className={styles.link} id="btn-switch-login">
                Entrar
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
