const PAGE = 20;
const st = { page: 0, rows: [], more: false, q: '', status: 'activo' };
const EMP_COLS = 'id,code,full_name,contact,position,department,hire_date,status';

bootObraPage('funcionarios', ['staff'], async (ctx, content, obraId) => {
  let positions = [];
  async function loadPositions() {
    const { data, error } = await db.from('job_positions').select('name').eq('obra_id', obraId).order('name').limit(200);
    if (!error) positions = data.map(x => x.name);
  }
  await loadPositions();

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
    const names = positions.slice();
    if (edit && r.position && !names.some(n => n.toLowerCase() === r.position.toLowerCase())) names.push(r.position);
    const posOpts = '<option value="">Seleccione o cargo</option>' + names.map(n =>
      '<option value="' + esc(n) + '"' + (edit && r.position === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
      '<option value="__new">+ Adicionar novo cargo...</option>';
    const m = openModal(edit ? 'Editar funcionário' : 'Novo funcionário',
      '<div id="f-msg"></div>' +
      (edit ? '<div class="kv"><span>Código</span><span>' + esc(r.code) + '</span></div>' : '<p class="sub">O código do funcionário é gerado automaticamente.</p>') +
      '<div class="field"><label for="e-name">Nome completo</label><input id="e-name" value="' + v('full_name') + '"></div>' +
      '<div class="field"><label for="e-contact">Contacto (opcional)</label><input id="e-contact" inputmode="tel" value="' + v('contact') + '"></div>' +
      '<div class="field"><label for="e-pos">Cargo</label><select id="e-pos">' + posOpts + '</select></div>' +
      '<div class="field" id="e-newpos-wrap" style="display:none"><label for="e-newpos">Nome do novo cargo</label><input id="e-newpos" placeholder="Ex.: Electricista"></div>' +
      '<div class="field"><label for="e-dep">Departamento</label><input id="e-dep" value="' + v('department') + '"></div>' +
      '<div class="field"><label for="e-hire">Data de admissão</label><input id="e-hire" type="date" value="' + (edit ? esc(String(r.hire_date).slice(0, 10)) : todayISO()) + '"></div>' +
      (edit ? '<div class="field"><label for="e-st">Estado</label><select id="e-st"><option value="activo"' + (r.status === 'activo' ? ' selected' : '') +
        '>Activo</option><option value="inactivo"' + (r.status === 'inactivo' ? ' selected' : '') + '>Inactivo</option></select></div>' : '') +
      '<button class="btn btn-primary btn-block" id="e-save">Guardar</button>');
    const g = id => $('#' + id, m.el).value.trim();
    $('#e-pos', m.el).addEventListener('change', e => {
      $('#e-newpos-wrap', m.el).style.display = e.target.value === '__new' ? 'block' : 'none';
      if (e.target.value === '__new') $('#e-newpos', m.el).focus();
    });
    $('#e-save', m.el).addEventListener('click', async () => {
      const msg = $('#f-msg', m.el), btn = $('#e-save', m.el);
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      const name = g('e-name'), hire = g('e-hire');
      let pos = $('#e-pos', m.el).value;
      if (pos === '__new') pos = g('e-newpos');
      if (!name || !pos || !hire) return fail('Nome, cargo e data de admissão são obrigatórios.');
      btn.disabled = true; btn.textContent = 'A guardar...';
      try {
        if (!positions.some(n => n.toLowerCase() === pos.toLowerCase())) {
          const pr = await db.from('job_positions').insert({ obra_id: obraId, name: pos });
          if (pr.error && pr.error.code !== '23505') throw pr.error;
          await loadPositions();
        }
        let res;
        if (edit) {
          res = await db.from('employees').update({ full_name: name, contact: g('e-contact') || null, position: pos,
            department: g('e-dep') || null, hire_date: hire, status: g('e-st') }).eq('id', r.id).eq('obra_id', obraId);
        } else {
          res = await db.rpc('create_employee', { p_obra: obraId, p_name: name, p_position: pos, p_hire_date: hire,
            p_contact: g('e-contact') || null, p_department: g('e-dep') || null });
        }
        if (res.error) throw res.error;
        m.close();
        toast(edit ? 'Funcionário actualizado.' : 'Funcionário registado. Código: ' + (res.data && res.data.code ? res.data.code : ''));
        load(true);
      } catch (e) { fail(errMsg(e)); btn.disabled = false; btn.textContent = 'Guardar'; }
    });
  }
  await load(true);
});
