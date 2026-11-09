const PAGE = 20;
const st = { page: 0, rows: [], more: false, q: '', cat: '', active: '1' };
const MAT_COLS = 'id,code,name,category_id,brand,model,description,unit,stock,min_stock,location,unit_price,active,material_categories(name)';

bootObraPage('materiais', ['warehouse'], async (ctx, content, obraId) => {
  const canInv = can(ctx, 'inventory');
  let cats = [];
  try { cats = await getCategories(obraId); } catch (e) { /* lista fica vazia */ }

  content.innerHTML =
    '<div class="row"><div><h1>Materiais</h1><p class="sub" style="margin:0">Cadastro e stock do armazém</p></div>' +
    '<button class="btn btn-primary" id="btn-new">Novo</button></div>' +
    '<div class="filters"><div class="field"><input id="f-q" placeholder="Nome ou código" aria-label="Pesquisar"></div></div>' +
    '<div class="filters"><div class="field"><select id="f-cat" aria-label="Categoria"></select></div>' +
    '<div class="field" style="flex:0 0 120px"><select id="f-act" aria-label="Estado"><option value="1">Activos</option><option value="0">Inactivos</option></select></div></div>' +
    '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="btn-search">Pesquisar</button>' +
    '<button class="btn" id="btn-cats">Categorias</button></div>' +
    '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';

  function fillCats() {
    $('#f-cat').innerHTML = '<option value="">Todas as categorias</option>' +
      cats.map(c => '<option value="' + esc(c.id) + '"' + (st.cat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  }
  fillCats();

  function apply() {
    st.q = $('#f-q').value.replace(/[,()%*\\]/g, ' ').trim();
    st.cat = $('#f-cat').value; st.active = $('#f-act').value;
    load(true);
  }
  $('#btn-search').addEventListener('click', apply);
  $('#f-q').addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
  $('#f-cat').addEventListener('change', apply);
  $('#f-act').addEventListener('change', apply);
  $('#btn-new').addEventListener('click', () => openForm(null));
  $('#btn-cats').addEventListener('click', openCategories);
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) openDetail(b.dataset.id);
  });

  async function load(reset) {
    const list = $('#list');
    try {
      if (reset) { st.page = 0; st.rows = []; }
      const from = st.page * PAGE;
      let q = db.from('materials').select(MAT_COLS).eq('obra_id', obraId)
        .eq('active', st.active === '1').order('name').range(from, from + PAGE - 1);
      if (st.cat) q = q.eq('category_id', st.cat);
      if (st.q) q = q.or('name.ilike.%' + st.q + '%,code.ilike.%' + st.q + '%');
      const { data, error } = await q;
      if (error) throw error;
      st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
      render();
    } catch (e) {
      list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }

  function catName(m) {
    const c = Array.isArray(m.material_categories) ? m.material_categories[0] : m.material_categories;
    return c ? c.name : '';
  }

  function render() {
    const list = $('#list'); list.className = '';
    list.innerHTML = st.rows.length ? st.rows.map(m =>
      '<button class="item" data-id="' + esc(m.id) + '"><div class="t"><span>' + esc(m.code + ' · ' + m.name) + '</span>' +
      stockBadge(m) + '</div><div class="s">' + esc(fmtNum(m.stock) + ' ' + m.unit) + ' · mín. ' + esc(fmtNum(m.min_stock)) +
      (catName(m) ? ' · ' + esc(catName(m)) : '') + (m.location ? ' · ' + esc(m.location) : '') + '</div></button>').join('')
      : '<div class="empty">Nenhum material encontrado.</div>';
    $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
    if (st.more) $('#btn-more').addEventListener('click', () => load(false));
  }

  function openDetail(id) {
    const mt = st.rows.find(x => x.id === id);
    if (!mt) return;
    const kv = (l, v) => v ? '<div class="kv"><span>' + l + '</span><span>' + esc(v) + '</span></div>' : '';
    const m = openModal(mt.name,
      kv('Código', mt.code) + kv('Categoria', catName(mt)) + kv('Marca', mt.brand) + kv('Modelo', mt.model) +
      kv('Stock actual', fmtNum(mt.stock) + ' ' + mt.unit) + kv('Stock mínimo', fmtNum(mt.min_stock)) +
      kv('Localização', mt.location) +
      kv('Preço unitário', mt.unit_price !== null ? fmtNum(mt.unit_price) : '') + kv('Descrição', mt.description) +
      (mt.active ? '' : '<div class="kv"><span>Estado</span><span>' + badge('Inactivo', 'muted') + '</span></div>') +
      '<div class="btn-row"><button class="btn btn-primary" id="d-edit">Editar</button>' +
      (canInv ? '<button class="btn" id="d-adj">Ajustar stock</button>' : '') +
      '<button class="btn ' + (mt.active ? 'btn-danger' : '') + '" id="d-tog">' + (mt.active ? 'Desactivar' : 'Reactivar') + '</button></div>');
    $('#d-edit', m.el).addEventListener('click', () => { m.close(); openForm(mt); });
    const adj = $('#d-adj', m.el);
    if (adj) adj.addEventListener('click', () => { m.close(); openAdjust(mt); });
    $('#d-tog', m.el).addEventListener('click', async () => {
      const to = !mt.active;
      if (!confirm(to ? 'Reactivar este material?' : 'Desactivar este material? Deixa de aparecer nas entradas e saídas.')) return;
      const { error } = await db.from('materials').update({ active: to }).eq('id', mt.id).eq('obra_id', obraId);
      if (error) { toast(errMsg(error), 'error'); return; }
      m.close(); toast(to ? 'Material reactivado.' : 'Material desactivado.'); load(true);
    });
  }

  function openAdjust(mt) {
    const m = openModal('Ajustar stock · ' + mt.code,
      '<p class="sub">Stock registado: <b>' + esc(fmtNum(mt.stock) + ' ' + mt.unit) + '</b>. O ajuste fica registado como movimentação e auditado.</p>' +
      '<div id="a-msg"></div><div class="field"><label for="a-new">Stock correcto</label><input id="a-new" inputmode="decimal"></div>' +
      '<div class="field"><label for="a-why">Motivo (obrigatório)</label><textarea id="a-why"></textarea></div>' +
      '<button class="btn btn-primary btn-block" id="a-save">Confirmar ajuste</button>');
    $('#a-save', m.el).addEventListener('click', async () => {
      const msg = $('#a-msg', m.el), btn = $('#a-save', m.el);
      const v = parseQty($('#a-new', m.el).value), why = $('#a-why', m.el).value.trim();
      if (!(v >= 0)) { msg.className = 'alert alert-error'; msg.textContent = 'Indique um stock válido.'; return; }
      if (!why) { msg.className = 'alert alert-error'; msg.textContent = 'O motivo é obrigatório.'; return; }
      btn.disabled = true;
      const { error } = await db.rpc('adjust_stock', { p_obra: obraId, p_material: mt.id, p_new_stock: v, p_reason: why });
      if (error) { msg.className = 'alert alert-error'; msg.textContent = errMsg(error); btn.disabled = false; return; }
      m.close(); toast('Stock ajustado.'); load(true);
    });
  }

  function openForm(mt) {
    const edit = !!mt;
    const val = k => esc(edit && mt[k] !== null && mt[k] !== undefined ? mt[k] : '');
    const catOpts = '<option value="">Sem categoria</option>' + cats.map(c =>
      '<option value="' + esc(c.id) + '"' + (edit && mt.category_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    const m = openModal(edit ? 'Editar material' : 'Novo material',
      '<div id="f-msg"></div>' +
      (edit ? '<div class="kv"><span>Código</span><span>' + esc(mt.code) + '</span></div>' : '<p class="sub">O código do material é gerado automaticamente.</p>') +
      '<div class="field"><label for="m-name">Nome</label><input id="m-name" value="' + val('name') + '"></div>' +
      '<div class="field"><label for="m-cat">Categoria</label><select id="m-cat">' + catOpts + '</select></div>' +
      '<div class="field"><label for="m-brand">Marca</label><input id="m-brand" value="' + val('brand') + '"></div>' +
      '<div class="field"><label for="m-model">Modelo</label><input id="m-model" value="' + val('model') + '"></div>' +
      '<div class="field"><label for="m-unit">Unidade de medida</label><input id="m-unit" list="units" value="' + val('unit') + '">' +
      '<datalist id="units"><option value="un"><option value="kg"><option value="m"><option value="m²"><option value="m³"><option value="l"><option value="cx"><option value="saco"><option value="rolo"></datalist></div>' +
      (edit ? '' : '<div class="field"><label for="m-init">Stock inicial</label><input id="m-init" inputmode="decimal" value="0"></div>') +
      '<div class="field"><label for="m-min">Stock mínimo</label><input id="m-min" inputmode="decimal" value="' + (edit ? esc(mt.min_stock) : '0') + '"></div>' +
      '<div class="field"><label for="m-loc">Localização no armazém</label><input id="m-loc" value="' + val('location') + '"></div>' +
      '<div class="field"><label for="m-price">Preço unitário (opcional)</label><input id="m-price" inputmode="decimal" value="' + val('unit_price') + '"></div>' +
      '<div class="field"><label for="m-desc">Descrição (opcional)</label><textarea id="m-desc">' + val('description') + '</textarea></div>' +
      '<button class="btn btn-primary btn-block" id="m-save">Guardar</button>');
    const g = id => $('#' + id, m.el).value.trim();
    $('#m-save', m.el).addEventListener('click', async () => {
      const msg = $('#f-msg', m.el), btn = $('#m-save', m.el);
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      const name = g('m-name'), unit = g('m-unit');
      const min = g('m-min') === '' ? 0 : parseQty(g('m-min'));
      const price = g('m-price') === '' ? null : parseQty(g('m-price'));
      const init = edit ? 0 : (g('m-init') === '' ? 0 : parseQty(g('m-init')));
      if (!name || !unit) return fail('Nome e unidade são obrigatórios.');
      if (!(min >= 0) || !(init >= 0) || (price !== null && !(price >= 0))) return fail('Verifique os valores numéricos.');
      btn.disabled = true; btn.textContent = 'A guardar...';
      try {
        let res;
        if (edit) {
          res = await db.from('materials').update({
            name, unit, category_id: g('m-cat') || null, brand: g('m-brand') || null, model: g('m-model') || null,
            description: g('m-desc') || null, min_stock: min, location: g('m-loc') || null, unit_price: price
          }).eq('id', mt.id).eq('obra_id', obraId);
        } else {
          res = await db.rpc('create_material', {
            p_obra: obraId, p_name: name, p_unit: unit, p_category: g('m-cat') || null,
            p_brand: g('m-brand') || null, p_model: g('m-model') || null, p_description: g('m-desc') || null,
            p_initial_stock: init, p_min_stock: min, p_location: g('m-loc') || null, p_unit_price: price });
        }
        if (res.error) throw res.error;
        m.close(); toast(edit ? 'Material actualizado.' : 'Material criado. Código: ' + (res.data && res.data.code ? res.data.code : '')); load(true);
      } catch (e) {
        fail(e.code === '23505' ? 'Já existe um material com este código nesta obra.' : errMsg(e));
        btn.disabled = false; btn.textContent = 'Guardar';
      }
    });
  }

  async function openCategories() {
    const m = openModal('Categorias',
      '<div id="c-msg"></div><div id="c-list" class="loading">A carregar...</div>' +
      '<div class="field" style="margin-top:14px"><label for="c-new">Nova categoria</label>' +
      '<div class="pw-row"><input id="c-new" placeholder="Ex.: Ferramentas"><button class="btn btn-primary" id="c-add" type="button">Adicionar</button></div></div>');
    const msg = $('#c-msg', m.el);
    async function refresh() {
      try {
        cats = await getCategories(obraId, true);
        const box = $('#c-list', m.el); box.className = '';
        box.innerHTML = cats.length ? cats.map(c => '<div class="kv"><span>' + esc(c.name) + '</span><span>' +
          '<button class="btn" data-ren="' + esc(c.id) + '" style="min-height:36px">Renomear</button></span></div>').join('')
          : '<div class="empty" style="padding:10px">Sem categorias.</div>';
        fillCats();
      } catch (e) { msg.className = 'alert alert-error'; msg.textContent = errMsg(e); }
    }
    $('#c-add', m.el).addEventListener('click', async () => {
      const name = $('#c-new', m.el).value.trim();
      if (!name) return;
      const { error } = await db.from('material_categories').insert({ obra_id: obraId, name });
      if (error) { msg.className = 'alert alert-error'; msg.textContent = error.code === '23505' ? 'Essa categoria já existe.' : errMsg(error); return; }
      msg.className = ''; msg.textContent = ''; $('#c-new', m.el).value = ''; refresh();
    });
    $('#c-list', m.el).addEventListener('click', async e => {
      const b = e.target.closest('[data-ren]');
      if (!b) return;
      const cur = cats.find(c => c.id === b.dataset.ren);
      const name = (prompt('Novo nome da categoria:', cur ? cur.name : '') || '').trim();
      if (!name || (cur && name === cur.name)) return;
      const { error } = await db.from('material_categories').update({ name }).eq('id', b.dataset.ren).eq('obra_id', obraId);
      if (error) { msg.className = 'alert alert-error'; msg.textContent = error.code === '23505' ? 'Essa categoria já existe.' : errMsg(error); return; }
      msg.className = ''; msg.textContent = ''; refresh();
    });
    refresh();
  }

  await load(true);
});
