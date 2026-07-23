'use client';

import { useEffect, useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { FinanceProvider } from '@/contexts/FinanceContext';
import AssistantWidget from '@/components/AssistantWidget/AssistantWidget';

export function Providers({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = localStorage.getItem('cashcopilot-theme') || 'light';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('cashcopilot-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  return (
    <AuthProvider>
      <FinanceProvider>
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
          {children}
          <AssistantWidget />
        </ThemeContext.Provider>
      </FinanceProvider>
    </AuthProvider>
  );
}

import { createContext, useContext } from 'react';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}
