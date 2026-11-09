// Gestão de utilizadores (Super Admin). Contas criadas/alteradas pela Edge Function "admin-users";
// permissões alteradas pela função SQL update_membership (auditada).
const PAGE = 20;
const st = { page: 0, rows: [], more: false, q: '', active: '' };
let obrasCache = null;

async function callAdmin(body) {
  const { data, error } = await db.functions.invoke('admin-users', { body });
  if (error) {
    let msg = 'Falha na operação. Verifique se a função admin-users está publicada.';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  // Só é sucesso se a função confirmar. Evita falsos sucessos (ex.: função com código errado).
  if (!data || data.ok !== true) throw new Error('Resposta inesperada da função admin-users. Verifique se o código publicado é o do ficheiro admin-users_index.ts.');
  return data;
}

async function getObras() {
  if (obrasCache) return obrasCache;
  const { data, error } = await db.from('obras').select('id,code,name').eq('status', 'ativa').order('name').limit(200);
  if (error) throw error;
  obrasCache = data;
  return data;
}

const memOf = r => Array.isArray(r.obra_memberships) ? r.obra_memberships[0] : r.obra_memberships;

(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    window.__me = ctx.user_id;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'utilizadores' });
    content.innerHTML =
      '<div class="row"><div><h1>Utilizadores</h1><p class="sub" style="margin:0">Contas, obras e permissões</p></div>' +
      '<button class="btn btn-primary" id="btn-new">Novo</button></div>' +
      '<div class="filters"><div class="field"><input id="f-q" placeholder="Nome ou email" aria-label="Pesquisar"></div>' +
      '<div class="field" style="flex:0 0 130px"><select id="f-active" aria-label="Estado"><option value="">Todos</option>' +
      '<option value="1">Activos</option><option value="0">Desactivados</option></select></div></div>' +
      '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="btn-search">Pesquisar</button></div>' +
      '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';
    $('#btn-new').addEventListener('click', openCreate);
    $('#btn-search').addEventListener('click', applyFilters);
    $('#f-q').addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });
    $('#f-active').addEventListener('change', applyFilters);
    $('#list').addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) openUser(b.dataset.id);
    });
    await load(true);
  } catch (e) { showFatal(e); }
})();

function applyFilters() {
  st.q = $('#f-q').value.replace(/[,()%*\\]/g, ' ').trim();
  st.active = $('#f-active').value;
  load(true);
}

async function load(reset) {
  const list = $('#list');
  try {
    if (reset) { st.page = 0; st.rows = []; }
    const from = st.page * PAGE;
    let q = db.from('profiles')
      .select('id,full_name,email,active,obra_memberships(obra_id,role,can_warehouse,can_staff,can_inventory,can_reports,can_admin,obras(code,name))')
      .eq('is_super_admin', false).order('full_name').range(from, from + PAGE - 1);
    if (st.active !== '') q = q.eq('active', st.active === '1');
    if (st.q) q = q.or('full_name.ilike.%' + st.q + '%,email.ilike.%' + st.q + '%');
    const { data, error } = await q;
    if (error) throw error;
    st.rows = st.rows.concat(data);
    st.more = data.length === PAGE;
    st.page++;
    render();
  } catch (e) {
    list.className = '';
    list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
  }
}

function render() {
  const list = $('#list');
  list.className = '';
  list.innerHTML = st.rows.length ? st.rows.map(r => {
    const m = memOf(r), ob = m && (Array.isArray(m.obras) ? m.obras[0] : m.obras);
    return '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(r.full_name) + '</span>' +
      badge(r.active ? 'Activo' : 'Desactivado', r.active ? 'ok' : 'bad') + '</div>' +
      '<div class="s">' + esc(r.email) + '</div>' +
      '<div class="s">' + (m ? esc((ob ? ob.name : '') + ' · ' + (ROLE_LABELS[m.role] || m.role)) : 'Sem obra atribuída') + '</div></button>';
  }).join('') : '<div class="empty">Nenhum utilizador encontrado.</div>';
  $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
  if (st.more) $('#btn-more').addEventListener('click', () => load(false));
}

function permsForm(p, obras, cur) {
  const opts = obras.map(o => '<option value="' + esc(o.id) + '"' + (cur.obra_id === o.id ? ' selected' : '') + '>' +
    esc(o.code + ' · ' + o.name) + '</option>').join('');
  const roles = Object.keys(ROLE_LABELS).map(k => '<option value="' + k + '"' + (cur.role === k ? ' selected' : '') + '>' +
    esc(ROLE_LABELS[k]) + '</option>').join('');
  const chk = (k, l, v) => '<label class="check"><input type="checkbox" id="' + p + '-' + k + '"' + (v ? ' checked' : '') + '> ' + l + '</label>';
  return '<div class="field"><label for="' + p + '-obra">Obra</label><select id="' + p + '-obra">' + opts + '</select></div>' +
    '<div class="field"><label for="' + p + '-role">Perfil</label><select id="' + p + '-role">' + roles + '</select></div>' +
    '<div class="section-title" style="margin-top:6px">Permissões</div>' +
    chk('warehouse', 'Gestão de armazém', cur.can_warehouse) + chk('staff', 'Gestão de pessoal', cur.can_staff) +
    chk('inventory', 'Gestão de inventário', cur.can_inventory) + chk('reports', 'Consulta de relatórios', cur.can_reports) +
    chk('admin', 'Administração operacional da obra', cur.can_admin);
}

function readPerms(el, p) {
  const c = k => $('#' + p + '-' + k, el).checked;
  return { obra: $('#' + p + '-obra', el).value, role: $('#' + p + '-role', el).value,
    warehouse: c('warehouse'), staff: c('staff'), inventory: c('inventory'), reports: c('reports'), admin: c('admin') };
}

function presetFor(role) {
  return { warehouse: role === 'gestor_armazem', staff: role === 'gestor_pessoal',
    inventory: false, reports: false, admin: false };
}

async function openCreate() {
  let obras;
  try { obras = await getObras(); } catch (e) { toast(errMsg(e), 'error'); return; }
  if (!obras.length) { toast('Crie primeiro uma obra activa.', 'error'); return; }
  const m = openModal('Novo utilizador',
    '<div id="u-msg"></div>' +
    '<div class="field"><label for="u-name">Nome completo</label><input id="u-name" autocomplete="off"></div>' +
    '<div class="field"><label for="u-email">Email</label><input id="u-email" type="email" autocomplete="off"></div>' +
    permsForm('c', obras, { role: 'gestor_armazem', can_warehouse: true }) +
    '<div class="field" style="margin-top:10px"><label for="u-pw">Palavra-passe temporária</label>' +
    '<div class="pw-row"><input id="u-pw" autocomplete="off"><button class="btn" id="u-gen" type="button">Gerar</button></div></div>' +
    '<button class="btn btn-primary btn-block" id="u-save">Criar conta</button>');
  $('#u-gen', m.el).addEventListener('click', () => { $('#u-pw', m.el).value = randomPassword(12); });
  $('#c-role', m.el).addEventListener('change', e => {
    const p = presetFor(e.target.value);
    Object.keys(p).forEach(k => { $('#c-' + k, m.el).checked = p[k]; });
  });
  $('#u-save', m.el).addEventListener('click', async () => {
    const msg = $('#u-msg', m.el), btn = $('#u-save', m.el);
    const name = $('#u-name', m.el).value.trim(), email = $('#u-email', m.el).value.trim();
    const pw = $('#u-pw', m.el).value, pr = readPerms(m.el, 'c');
    if (name.length < 2 || !email) { msg.className = 'alert alert-error'; msg.textContent = 'Indique nome e email.'; return; }
    if (pw.length < 8) { msg.className = 'alert alert-error'; msg.textContent = 'A palavra-passe deve ter pelo menos 8 caracteres.'; return; }
    btn.disabled = true; btn.textContent = 'A criar...';
    try {
      await callAdmin({ action: 'create', full_name: name, email, password: pw, obra_id: pr.obra, role: pr.role,
        perms: { warehouse: pr.warehouse, staff: pr.staff, inventory: pr.inventory, reports: pr.reports, admin: pr.admin } });
      m.body.innerHTML = '<div class="alert alert-ok">Conta criada com sucesso.</div>' +
        '<p>Entregue estes dados ao utilizador por um canal seguro. A palavra-passe não volta a ser mostrada.</p>' +
        '<div class="kv"><span>Email</span><span class="mono">' + esc(email.toLowerCase()) + '</span></div>' +
        '<div class="kv"><span>Palavra-passe</span><span class="mono">' + esc(pw) + '</span></div>' +
        '<p class="sub" style="margin-top:12px">Peça ao utilizador para a alterar em Conta, no primeiro acesso.</p>' +
        '<button class="btn btn-block" data-close>Fechar</button>';
      load(true);
    } catch (e) {
      msg.className = 'alert alert-error'; msg.textContent = errMsg(e);
      btn.disabled = false; btn.textContent = 'Criar conta';
    }
  });
}

async function openUser(id) {
  const r = st.rows.find(x => x.id === id);
  if (!r) return;
  let obras;
  try { obras = await getObras(); } catch (e) { toast(errMsg(e), 'error'); return; }
  const mem = memOf(r);
  const cur = mem || { role: 'gestor_armazem' };
  // Se a obra actual já não está activa, mantém-na visível na lista
  if (mem && !obras.some(o => o.id === mem.obra_id)) {
    const ob = Array.isArray(mem.obras) ? mem.obras[0] : mem.obras;
    obras = obras.concat([{ id: mem.obra_id, code: ob ? ob.code : '', name: (ob ? ob.name : '') + ' (não activa)' }]);
  }
  const self = r.id === window.__me;
  const m = openModal(r.full_name,
    '<div class="kv"><span>Email</span><span>' + esc(r.email) + '</span></div>' +
    '<div class="kv"><span>Estado</span><span>' + badge(r.active ? 'Activo' : 'Desactivado', r.active ? 'ok' : 'bad') + '</span></div>' +
    '<div class="section-title">Obra e permissões</div><div id="m-msg"></div>' +
    permsForm('e', obras, cur) +
    '<button class="btn btn-primary btn-block" id="m-save">Guardar permissões</button>' +
    '<div class="section-title">Palavra-passe temporária</div>' +
    '<div class="pw-row"><input id="m-pw" placeholder="Mínimo 8 caracteres" autocomplete="off" style="min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:8px;font-size:16px">' +
    '<button class="btn" id="m-gen" type="button">Gerar</button></div>' +
    '<div class="btn-row"><button class="btn" id="m-setpw">Definir palavra-passe</button></div>' +
    '<div class="section-title">Conta</div>' +
    (self ? '<p class="sub">Não pode desactivar a própria conta.</p>' :
      '<button class="btn ' + (r.active ? 'btn-danger' : 'btn-primary') + ' btn-block" id="m-toggle">' +
      (r.active ? 'Desactivar utilizador' : 'Reactivar utilizador') + '</button>'));

  const msg = () => $('#m-msg', m.el);
  $('#m-save', m.el).addEventListener('click', async () => {
    const pr = readPerms(m.el, 'e'), btn = $('#m-save', m.el);
    btn.disabled = true;
    try {
      const { error } = await db.rpc('update_membership', {
        p_user: r.id, p_obra: pr.obra, p_role: pr.role, p_warehouse: pr.warehouse,
        p_staff: pr.staff, p_inventory: pr.inventory, p_reports: pr.reports, p_admin: pr.admin });
      if (error) throw error;
      m.close(); toast('Permissões guardadas.'); load(true);
    } catch (e) { msg().className = 'alert alert-error'; msg().textContent = errMsg(e); btn.disabled = false; }
  });
  $('#m-gen', m.el).addEventListener('click', () => { $('#m-pw', m.el).value = randomPassword(12); });
  $('#m-setpw', m.el).addEventListener('click', async () => {
    const pw = $('#m-pw', m.el).value;
    if (pw.length < 8) { msg().className = 'alert alert-error'; msg().textContent = 'A palavra-passe deve ter pelo menos 8 caracteres.'; return; }
    try {
      await callAdmin({ action: 'set_password', user_id: r.id, password: pw });
      msg().className = 'alert alert-ok';
      msg().innerHTML = 'Palavra-passe definida: <span class="mono">' + esc(pw) + '</span>. Entregue-a por um canal seguro.';
    } catch (e) { msg().className = 'alert alert-error'; msg().textContent = errMsg(e); }
  });
  const tg = $('#m-toggle', m.el);
  if (tg) tg.addEventListener('click', async () => {
    const to = !r.active;
    if (!confirm(to ? 'Reactivar este utilizador?' : 'Desactivar este utilizador? Perde o acesso de imediato.')) return;
    tg.disabled = true;
    try {
      await callAdmin({ action: 'set_active', user_id: r.id, active: to });
      m.close(); toast(to ? 'Utilizador reactivado.' : 'Utilizador desactivado.'); load(true);
    } catch (e) { msg().className = 'alert alert-error'; msg().textContent = errMsg(e); tg.disabled = false; }
  });
}
