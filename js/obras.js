// Gestão de obras (Super Admin). Escrita só por funções SQL auditadas.
const PAGE = 20;
const STATUS_LABEL = { ativa: 'Activa', encerrada: 'Encerrada', inactiva: 'Inactiva' };
const STATUS_CLS = { ativa: 'ok', encerrada: 'muted', inactiva: 'warn' };
const state = { page: 0, status: '', rows: [], more: false };

(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'obras' });
    content.innerHTML =
      '<div class="row"><div><h1>Obras</h1><p class="sub" style="margin:0">Cadastro e estado das obras</p></div>' +
      '<button class="btn btn-primary" id="btn-new">Nova obra</button></div>' +
      '<div class="filters"><div class="field"><select id="f-status" aria-label="Filtrar por estado">' +
      '<option value="">Todos os estados</option><option value="ativa">Activas</option>' +
      '<option value="encerrada">Encerradas</option><option value="inactiva">Inactivas</option></select></div></div>' +
      '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';
    $('#btn-new').addEventListener('click', () => openObraForm(null));
    $('#f-status').addEventListener('change', e => { state.status = e.target.value; load(true); });
    $('#list').addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) openObra(b.dataset.id);
    });
    await load(true);
  } catch (e) { showFatal(e); }
})();

async function load(reset) {
  const list = $('#list');
  try {
    if (reset) { state.page = 0; state.rows = []; }
    const from = state.page * PAGE;
    let q = db.from('obras')
      .select('id,code,name,location,description,start_date,manager_name,status')
      .order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    if (state.status) q = q.eq('status', state.status);
    const { data, error } = await q;
    if (error) throw error;
    state.rows = state.rows.concat(data);
    state.more = data.length === PAGE;
    state.page++;
    render();
  } catch (e) {
    list.className = '';
    list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
  }
}

function render() {
  const list = $('#list');
  list.className = '';
  list.innerHTML = state.rows.length ? state.rows.map(o =>
    '<button class="item" data-id="' + esc(o.id) + '"><div class="t"><span>' + esc(o.name) + '</span>' +
    badge(STATUS_LABEL[o.status] || o.status, STATUS_CLS[o.status]) + '</div>' +
    '<div class="s">' + esc(o.code) + ' · ' + esc(o.location) + '</div></button>').join('')
    : '<div class="empty">Nenhuma obra encontrada.</div>';
  const mw = $('#more-wrap');
  mw.innerHTML = state.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
  if (state.more) $('#btn-more').addEventListener('click', () => load(false));
}

async function openObra(id) {
  const o = state.rows.find(x => x.id === id);
  if (!o) return;
  const m = openModal(o.name,
    '<div class="kv"><span>Código</span><span>' + esc(o.code) + '</span></div>' +
    '<div class="kv"><span>Estado</span><span>' + badge(STATUS_LABEL[o.status] || o.status, STATUS_CLS[o.status]) + '</span></div>' +
    '<div class="kv"><span>Localização</span><span>' + esc(o.location) + '</span></div>' +
    '<div class="kv"><span>Início</span><span>' + esc(fmtDate(o.start_date)) + '</span></div>' +
    '<div class="kv"><span>Responsável principal</span><span>' + esc(o.manager_name) + '</span></div>' +
    (o.description ? '<div class="kv"><span>Descrição</span><span>' + esc(o.description) + '</span></div>' : '') +
    '<div class="section-title">Utilizadores desta obra</div><div id="o-users" class="loading">A carregar...</div>' +
    '<div class="btn-row"><button class="btn btn-primary" id="o-edit">Editar</button></div>');
  $('#o-edit', m.el).addEventListener('click', () => { m.close(); openObraForm(o); });
  try {
    const { data, error } = await db.from('obra_memberships')
      .select('role,can_admin,profiles(full_name,email,active)').eq('obra_id', id).limit(50);
    if (error) throw error;
    const box = $('#o-users', m.el);
    box.className = '';
    box.innerHTML = data.length ? data.map(r => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return '<div class="kv"><span>' + esc(p ? p.full_name : '') + '</span><span>' +
        esc(ROLE_LABELS[r.role] || r.role) + (p && !p.active ? ' ' + badge('Desactivado', 'bad') : '') + '</span></div>';
    }).join('') : '<div class="s" style="color:var(--muted)">Ainda sem utilizadores atribuídos.</div>';
  } catch (e) {
    const box = $('#o-users', m.el);
    if (box) { box.className = ''; box.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
  }
}

function openObraForm(o) {
  const edit = !!o;
  const today = new Date().toISOString().slice(0, 10);
  const statusField = edit
    ? '<div class="field"><label for="o-status">Estado</label><select id="o-status">' +
      ['ativa', 'encerrada', 'inactiva'].map(s =>
        '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>').join('') +
      '</select></div>' : '';
  const m = openModal(edit ? 'Editar obra' : 'Nova obra',
    '<div id="o-msg"></div>' +
    (edit ? '' : '<p class="sub">O código da obra é gerado automaticamente.</p>') +
    '<div class="field"><label for="o-name">Nome da obra</label><input id="o-name" value="' + esc(edit ? o.name : '') + '"></div>' +
    '<div class="field"><label for="o-loc">Localização</label><input id="o-loc" value="' + esc(edit ? o.location : '') + '"></div>' +
    '<div class="field"><label for="o-mgr">Responsável principal</label><input id="o-mgr" value="' + esc(edit ? o.manager_name : '') + '"></div>' +
    '<div class="field"><label for="o-start">Data de início</label><input id="o-start" type="date" value="' + esc(edit ? String(o.start_date).slice(0, 10) : today) + '"></div>' +
    '<div class="field"><label for="o-desc">Descrição (opcional)</label><textarea id="o-desc">' + esc(edit ? (o.description || '') : '') + '</textarea></div>' +
    statusField +
    '<button class="btn btn-primary btn-block" id="o-save">Guardar</button>');

  $('#o-save', m.el).addEventListener('click', async () => {
    const msg = $('#o-msg', m.el), btn = $('#o-save', m.el);
    const v = {
      name: $('#o-name', m.el).value.trim(), loc: $('#o-loc', m.el).value.trim(),
      mgr: $('#o-mgr', m.el).value.trim(), start: $('#o-start', m.el).value,
      desc: $('#o-desc', m.el).value.trim()
    };
    if (!v.name || !v.loc || !v.mgr || !v.start) {
      msg.className = 'alert alert-error'; msg.textContent = 'Preencha nome, localização, responsável e data de início.'; return;
    }
    btn.disabled = true; btn.textContent = 'A guardar...';
    try {
      const res = edit
        ? await db.rpc('update_obra', {
            p_id: o.id, p_name: v.name, p_location: v.loc, p_description: v.desc || null,
            p_start: v.start, p_manager: v.mgr, p_status: $('#o-status', m.el).value })
        : await db.rpc('create_obra', {
            p_name: v.name, p_location: v.loc, p_description: v.desc || null,
            p_start: v.start, p_manager: v.mgr });
      if (res.error) throw res.error;
      m.close();
      toast(edit ? 'Obra actualizada.' : 'Obra criada.');
      load(true);
    } catch (e) {
      msg.className = 'alert alert-error'; msg.textContent = errMsg(e);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  });
}
