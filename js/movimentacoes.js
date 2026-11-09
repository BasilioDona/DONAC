const PAGE = 20;
const st = { page: 0, rows: [], more: false, type: '', from: '', to: '' };

bootObraPage('movimentos', ['warehouse', 'inventory', 'reports'], async (ctx, content, obraId) => {
  content.innerHTML =
    '<h1>Movimentações</h1><p class="sub">Histórico completo. Os registos não podem ser alterados nem apagados.</p>' +
    '<div class="filters"><div class="field"><select id="f-type" aria-label="Tipo">' +
    '<option value="">Todos os tipos</option><option value="entrada">Entradas</option>' +
    '<option value="saida">Saídas</option><option value="ajuste">Ajustes</option></select></div></div>' +
    '<div class="filters"><div class="field"><label for="f-from">De</label><input id="f-from" type="date"></div>' +
    '<div class="field"><label for="f-to">Até</label><input id="f-to" type="date"></div></div>' +
    '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="btn-apply">Aplicar filtros</button></div>' +
    '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';

  $('#btn-apply').addEventListener('click', () => {
    st.type = $('#f-type').value; st.from = $('#f-from').value; st.to = $('#f-to').value;
    load(true);
  });
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const r = st.rows.find(x => x.id === b.dataset.id);
    if (r) movementDetail(r);
  });

  async function load(reset) {
    const list = $('#list');
    try {
      if (reset) { st.page = 0; st.rows = []; }
      const from = st.page * PAGE;
      let q = db.from('stock_movements').select(MOV_COLS).eq('obra_id', obraId)
        .order('created_at', { ascending: false }).range(from, from + PAGE - 1);
      if (st.type) q = q.eq('type', st.type);
      if (st.from) q = q.gte('movement_date', st.from);
      if (st.to) q = q.lte('movement_date', st.to);
      const { data, error } = await q;
      if (error) throw error;
      st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
      list.className = '';
      list.innerHTML = st.rows.length ? st.rows.map(movementItem).join('') : '<div class="empty">Sem movimentações para estes filtros.</div>';
      $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
      if (st.more) $('#btn-more').addEventListener('click', () => load(false));
    } catch (e) {
      list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }
  await load(true);
});
