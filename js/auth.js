// Autenticacao e redirecionamento. O redirecionamento NAO e seguranca:
// a protecao real dos dados esta no RLS e nas funcoes SQL.
async function getContext() {
  const { data, error } = await db.rpc('get_my_context');
  if (error) throw error;
  return data;
}

function destinationFor(ctx) {
  if (!ctx || !ctx.active) return { ok: false, reason: 'Conta desactivada ou inexistente.' };
  if (ctx.is_super_admin) return { ok: true, kind: 'super', href: 'admin.html' };
  if (!ctx.membership) return { ok: false, reason: 'A sua conta não tem nenhuma obra atribuída.' };
  if (ctx.membership.obra_status !== 'ativa') return { ok: false, reason: 'A obra atribuída não está activa.' };
  return { ok: true, kind: 'obra', href: 'dashboard.html' };
}

async function failAccess(msg) {
  sessionStorage.setItem('donac_msg', msg);
  await db.auth.signOut();
  location.replace('login.html');
}

// Protege uma pagina: kind = 'super' | 'obra'. Devolve o contexto ou null (ja redirecionou).
async function guard(kind) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.replace('login.html'); return null; }
  let ctx;
  try { ctx = await getContext(); }
  catch (e) { await failAccess('Sessão inválida. Inicie sessão novamente.'); return null; }
  const dest = destinationFor(ctx);
  if (!dest.ok) { await failAccess(dest.reason); return null; }
  if (kind !== 'any' && dest.kind !== kind) { location.replace(dest.href); return null; }
  return ctx;
}

async function signOut() {
  await db.auth.signOut();
  location.replace('login.html');
}

// Router de entrada (index.html)
async function routeFromIndex() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.replace('login.html'); return; }
  try {
    const dest = destinationFor(await getContext());
    if (dest.ok) location.replace(dest.href); else await failAccess(dest.reason);
  } catch (e) { await failAccess('Sessão inválida. Inicie sessão novamente.'); }
}

// Pagina de login
async function initLoginPage() {
  const box = $('#msg'), btn = $('#btn-login');
  const stored = sessionStorage.getItem('donac_msg');
  if (stored) {
    sessionStorage.removeItem('donac_msg');
    box.className = 'alert alert-error'; box.textContent = stored;
  }
  const { data: { session } } = await db.auth.getSession();
  if (session) { routeFromIndex(); return; }

  $('#login-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    box.className = ''; box.textContent = '';
    btn.disabled = true; btn.textContent = 'A entrar...';
    try {
      const { error } = await db.auth.signInWithPassword({
        email: $('#email').value.trim(), password: $('#password').value
      });
      if (error) throw error;
      const dest = destinationFor(await getContext());
      if (!dest.ok) { await failAccess(dest.reason); return; }
      location.replace(dest.href);
    } catch (e) {
      box.className = 'alert alert-error';
      box.textContent = 'Email ou palavra-passe incorrectos.';
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });
}
