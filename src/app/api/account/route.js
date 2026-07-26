import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Apagar o usuário do auth.users exige a service-role key (operação
// administrativa, não pode ser feita com a anon key do client). Todas as
// tabelas referenciam perfis(id) ON DELETE CASCADE, e perfis referencia
// auth.users(id) ON DELETE CASCADE — apagar o usuário já apaga tudo em
// cascata, sem precisar zerar tabela por tabela aqui.
export async function DELETE(req) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: 'Supabase não configurado no servidor.' },
      { status: 500 }
    );
  }
  if (!supabaseServiceRoleKey) {
    return Response.json(
      {
        error:
          'SUPABASE_SERVICE_ROLE_KEY não configurada. Copie a "service_role key" em Supabase → Settings → API e adicione no .env.local (e nas Environment Variables da Vercel em produção).',
      },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    // Client autenticado como o usuário da requisição — só pra confirmar
    // quem ele é. Nunca confiamos num id vindo direto do client.
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    // Só a partir daqui a service role é usada, e só pra apagar ESSE
    // usuário específico (id validado acima via o token dele mesmo).
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[Account] deleteUser error:', deleteError);
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[Account] delete route error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro inesperado ao excluir a conta.' },
      { status: 500 }
    );
  }
}
