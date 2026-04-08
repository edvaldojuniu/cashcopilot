# 💰 Cash Copilot

Gerenciador Financeiro Pessoal com Previsão Automatizada.

## Funcionalidades

- 📊 **Termômetro diário** — Visualize entradas, saídas e saldo dia a dia
- 🔮 **Previsão financeira** — Veja quanto pode gastar cada dia para não ficar no vermelho
- 💳 **Controle de cartões** — Faturas parceladas distribuídas automaticamente
- 🎯 **Performance mensal** — Quanto sobrou/faltou no mês
- 🌓 **Tema claro/escuro** — Interface clean e amigável
- 📱 **PWA** — Instale no celular como app nativo
- 🔐 **Multi-usuário** — Cada pessoa com seus dados isolados

## Tech Stack

- **Next.js 14** (App Router)
- **Supabase** (Auth + PostgreSQL)
- **CSS Modules** (Vanilla CSS)
- **Vercel** (Deploy)

## Setup

1. Clone o repositório
2. `npm install`
3. Crie um projeto no [Supabase](https://supabase.com)
4. Copie `.env.local` e preencha as credenciais
5. Execute o SQL em `docs/supabase-setup.sql` no SQL Editor do Supabase
6. `npm run dev`

## Deploy

O deploy é automático via Vercel ao dar push no GitHub.
