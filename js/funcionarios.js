const PAGE = 20;
const st = { page: 0, rows: [], more: false, q: '', status: 'activo' };
const EMP_COLS = 'id,code,full_name,contact,position,department,hire_date,status';

bootObraPage('funcionarios', ['staff'], async (ctx, content, obraId) => {
  content.innerHTML =
    '<div class="row"><div><h1>Funcionários</h1><p class="sub" style="margin:0">Cadastro da obra</p></div>' +
    '<button class="btn btn-primary" id="btn-new">Novo</button></div>' +
    '<div class="filters"><div class="field"><input id="f-q" placeholder="Nome, código ou cargo" aria-label="Pesquisar"></div>' +
    '<div class="field" style="flex:0 0 120px"><select id="f-st" aria-label="Estado"><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></div></div>' +
    '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="btn-search">Pesquisar</button></div>' +
    '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';

  function apply() { st.q = $('#f-q').value.replace(/[,()%*\\]/g, ' ').trim(); st.status = $('#f-st').value; load(true); }
  $('#btn-search').addEventListener('click', apply);
  $('#f-q').addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
  $('#f-st').addEventListener('change', apply);
  $('#btn-new').addEventListener('click', () => openForm(null));
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) { const r = st.rows.find(x => x.id === b.dataset.id); if (r) openForm(r); }
  });

  async function load(reset) {
    const list = $('#list');
    try {
      if (reset) { st.page = 0; st.rows = []; }
      const from = st.page * PAGE;
      let q = db.from('employees').select(EMP_COLS).eq('obra_id', obraId).eq('status', st.status)
        .order('full_name').range(from, from + PAGE - 1);
      if (st.q) q = q.or('full_name.ilike.%' + st.q + '%,code.ilike.%' + st.q + '%,position.ilike.%' + st.q + '%');
      const { data, error } = await q;
      if (error) throw error;
      st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
      list.className = '';
      list.innerHTML = st.rows.length ? st.rows.map(r =>
        '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(r.full_name) + '</span>' +
        (r.status === 'activo' ? '' : badge('Inactivo', 'muted')) + '</div><div class="s">' + esc(r.code) + ' · ' + esc(r.position) +
        (r.department ? ' · ' + esc(r.department) : '') + '</div></button>').join('')
        : '<div class="empty">Nenhum funcionário encontrado.</div>';
      $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
      if (st.more) $('#btn-more').addEventListener('click', () => load(false));
    } catch (e) {
      list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }

  function openForm(r) {
    const edit = !!r, v = k => esc(edit && r[k] ? r[k] : '');
    const m = openModal(edit ? 'Editar funcionário' : 'Novo funcionário',
      '<div id="f-msg"></div>' +
      '<div class="field"><label for="e-code">Código do funcionário</label><input id="e-code" value="' + v('code') + '"></div>' +
      '<div class="field"><label for="e-name">Nome completo</label><input id="e-name" value="' + v('full_name') + '"></div>' +
      '<div class="field"><label for="e-contact">Contacto (opcional)</label><input id="e-contact" inputmode="tel" value="' + v('contact') + '"></div>' +
      '<div class="field"><label for="e-pos">Cargo</label><input id="e-pos" value="' + v('position') + '"></div>' +
      '<div class="field"><label for="e-dep">Departamento</label><input id="e-dep" value="' + v('department') + '"></div>' +
      '<div class="field"><label for="e-hire">Data de admissão</label><input id="e-hire" type="date" value="' + (edit ? esc(String(r.hire_date).slice(0, 10)) : todayISO()) + '"></div>' +
      (edit ? '<div class="field"><label for="e-st">Estado</label><select id="e-st"><option value="activo"' + (r.status === 'activo' ? ' selected' : '') +
        '>Activo</option><option value="inactivo"' + (r.status === 'inactivo' ? ' selected' : '') + '>Inactivo</option></select></div>' : '') +
      '<button class="btn btn-primary btn-block" id="e-save">Guardar</button>');
    const g = id => $('#' + id, m.el).value.trim();
    $('#e-save', m.el).addEventListener('click', async () => {
      const msg = $('#f-msg', m.el), btn = $('#e-save', m.el);
      const code = g('e-code'), name = g('e-name'), pos = g('e-pos'), hire = g('e-hire');
      if (!code || !name || !pos || !hire) { msg.className = 'alert alert-error'; msg.textContent = 'Código, nome, cargo e data de admissão são obrigatórios.'; return; }
      const row = { code, full_name: name, contact: g('e-contact') || null, position: pos, department: g('e-dep') || null, hire_date: hire };
      btn.disabled = true; btn.textContent = 'A guardar...';
      let res;
      if (edit) { row.status = g('e-st'); res = await db.from('employees').update(row).eq('id', r.id).eq('obra_id', obraId); }
      else { row.obra_id = obraId; res = await db.from('employees').insert(row); }
      if (res.error) {
        msg.className = 'alert alert-error';
        msg.textContent = res.error.code === '23505' ? 'Já existe um funcionário com este código nesta obra.' : errMsg(res.error);
        btn.disabled = false; btn.textContent = 'Guardar'; return;
      }
      m.close(); toast(edit ? 'Funcionário actualizado.' : 'Funcionário registado.'); load(true);
    });
  }
  await load(true);
});
