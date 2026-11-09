// Eliminação definitiva de operações (só Super Admin). Exige motivo e fica registada na auditoria.
const PAGE = 30;
const st = { obra: '', tipo: 'mov', page: 0, rows: [], more: false, sel: new Set(), from: '', to: '', filtro: '' };

(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'registos' });
    const ob = await db.from('obras').select('id,code,name').order('name').limit(200);
    if (ob.error) throw ob.error;
    if (!ob.data.length) { content.innerHTML = '<div class="alert alert-error">Ainda não existem obras.</div>'; return; }
    st.obra = ob.data[0].id;
    const d0 = new Date(); d0.setDate(d0.getDate() - 30);
    st.from = d0.toISOString().slice(0, 10); st.to = todayISO();

    content.innerHTML =
      '<h1>Eliminar registos</h1><div class="alert alert-error">Eliminação definitiva. Cada registo apagado fica guardado na auditoria com o motivo.</div>' +
      '<div class="field"><label for="x-obra">Obra</label><select id="x-obra">' + ob.data.map(o => '<option value="' + esc(o.id) + '">' + esc(o.code + ' · ' + o.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="x-tipo">O que eliminar</label><select id="x-tipo"><option value="mov">Movimentações (entradas, saídas, ajustes)</option>' +
      '<option value="att">Presenças e faltas</option><option value="inv">Inventários</option></select></div>' +
      '<div class="field" id="x-f-wrap"><label for="x-filtro">Filtrar</label><select id="x-filtro"></select></div>' +
      '<div class="filters"><div class="field"><label for="x-from">De</label><input id="x-from" type="date" value="' + st.from + '"></div>' +
      '<div class="field"><label for="x-to">Até</label><input id="x-to" type="date" value="' + st.to + '"></div></div>' +
      '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="x-go">Procurar</button></div>' +
      '<div id="list"></div><div id="more-wrap"></div>' +
      '<div style="position:sticky;bottom:calc(var(--nav-h) + 8px);margin-top:12px"><button class="btn btn-danger btn-block" id="x-del" disabled style="background:#fff">Eliminar seleccionados (0)</button></div>';

    const FILTROS = {
      mov: [['', 'Todos os tipos'], ['entrada', 'Entradas'], ['saida', 'Saídas'], ['ajuste', 'Ajustes']],
      att: [['', 'Todos os estados'], ['presente', 'Presenças'], ['falta_pendente', 'Faltas pendentes'], ['falta_justificada', 'Faltas justificadas'],
        ['falta_injustificada', 'Faltas injustificadas'], ['ferias', 'Férias'], ['licenca', 'Licenças']],
      inv: [['', 'Todos os estados'], ['aberto', 'Em curso'], ['confirmado', 'Confirmados'], ['cancelado', 'Cancelados']]
    };
    function fillFiltro() {
      $('#x-filtro').innerHTML = FILTROS[st.tipo].map(f => '<option value="' + f[0] + '">' + f[1] + '</option>').join('');
      st.filtro = '';
    }
    fillFiltro();

    const first = a => Array.isArray(a) ? a[0] : a;
    function rowHtml(r) {
      let t, s;
      if (st.tipo === 'mov') {
        const m = first(r.materials) || {}, neg = r.type === 'saida' || (r.type === 'ajuste' && Number(r.quantity) < 0);
        t = '<span>' + esc(m.name || '') + '</span>' + badge(TYPE_LABEL[r.type], TYPE_CLS[r.type]);
        s = esc(fmtDate(r.movement_date) + ' · ' + (neg ? '−' : '+') + fmtNum(Math.abs(r.quantity)) + ' ' + (m.unit || '') + ' · stock ' + fmtNum(r.stock_before) + ' → ' + fmtNum(r.stock_after));
      } else if (st.tipo === 'att') {
        const e = empOf(r) || {};
        t = '<span>' + esc(e.full_name || '') + '</span>' + badge(ATT_LABEL[r.status], ATT_CLS[r.status]);
        s = esc(fmtDate(r.work_date) + (r.notes ? ' · ' + r.notes : ''));
      } else {
        const L = { aberto: 'Em curso', confirmado: 'Confirmado', cancelado: 'Cancelado' }, C = { aberto: 'warn', confirmado: 'ok', cancelado: 'muted' };
        t = '<span>Inventário de ' + esc(fmtDate(r.started_at)) + '</span>' + badge(L[r.status], C[r.status]);
        s = esc(r.notes || '');
      }
      return '<label class="item" style="display:flex;gap:12px;align-items:flex-start"><input type="checkbox" data-id="' + esc(r.id) + '"' +
        (st.sel.has(r.id) ? ' checked' : '') + ' style="width:22px;height:22px;margin-top:2px;flex:none"><div style="flex:1;min-width:0"><div class="t">' + t + '</div><div class="s">' + s + '</div></div></label>';
    }

    function query() {
      let q;
      if (st.tipo === 'mov') {
        q = db.from('stock_movements').select(MOV_COLS).eq('obra_id', st.obra).gte('movement_date', st.from).lte('movement_date', st.to)
          .order('created_at', { ascending: false }).order('id');
        if (st.filtro) q = q.eq('type', st.filtro);
      } else if (st.tipo === 'att') {
        q = db.from('attendance').select(ATT_COLS).eq('obra_id', st.obra).gte('work_date', st.from).lte('work_date', st.to)
          .order('work_date', { ascending: false }).order('id');
        if (st.filtro) q = q.eq('status', st.filtro);
      } else {
        q = db.from('inventory_sessions').select('id,status,notes,started_at').eq('obra_id', st.obra)
          .gte('started_at', st.from).lte('started_at', st.to + 'T23:59:59').order('started_at', { ascending: false }).order('id');
        if (st.filtro) q = q.eq('status', st.filtro);
      }
      return q;
    }

    function updateBtn() {
      const b = $('#x-del'); b.disabled = st.sel.size === 0;
      b.textContent = 'Eliminar seleccionados (' + st.sel.size + ')';
    }

    async function load(reset) {
      const list = $('#list');
      try {
        if (reset) { st.page = 0; st.rows = []; st.sel.clear(); updateBtn(); list.innerHTML = '<div class="loading">A carregar...</div>'; }
        const from = st.page * PAGE;
        const { data, error } = await query().range(from, from + PAGE - 1);
        if (error) throw error;
        st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
        list.innerHTML = st.rows.length ? st.rows.map(rowHtml).join('') : '<div class="empty">Sem registos.</div>';
        $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="x-more">Carregar mais</button>' : '';
        if (st.more) $('#x-more').addEventListener('click', () => load(false));
      } catch (e) { list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
    }

    $('#x-obra').addEventListener('change', e => { st.obra = e.target.value; load(true); });
    $('#x-tipo').addEventListener('change', e => { st.tipo = e.target.value; fillFiltro(); load(true); });
    $('#x-go').addEventListener('click', () => { st.from = $('#x-from').value; st.to = $('#x-to').value; st.filtro = $('#x-filtro').value; load(true); });
    $('#list').addEventListener('change', e => {
      const c = e.target.closest('[data-id]'); if (!c) return;
      if (c.checked) st.sel.add(c.dataset.id); else st.sel.delete(c.dataset.id);
      updateBtn();
    });

    $('#x-del').addEventListener('click', () => {
      if (st.sel.size > 200) { toast('Máximo de 200 registos de cada vez.', 'error'); return; }
      const aviso = st.tipo === 'mov' ? 'O stock dos materiais afectados é recalculado. Se o stock ficasse negativo, a eliminação é recusada.'
        : st.tipo === 'inv' ? 'As contagens são apagadas. Os ajustes de stock que o inventário gerou ficam nas movimentações.' : 'As presenças e faltas seleccionadas são apagadas.';
      const m = openModal('Eliminar definitivamente',
        '<div class="alert alert-error">' + st.sel.size + ' registo(s) serão eliminados e não podem ser recuperados.</div><p class="sub">' + esc(aviso) + '</p><div id="d-msg"></div>' +
        '<div class="field"><label for="d-why">Motivo (obrigatório)</label><textarea id="d-why"></textarea></div>' +
        '<div class="field"><label for="d-conf">Escreva ELIMINAR para confirmar</label><input id="d-conf" autocomplete="off"></div>' +
        '<button class="btn btn-danger btn-block" id="d-go">Eliminar definitivamente</button>');
      $('#d-go', m.el).addEventListener('click', async () => {
        const msg = $('#d-msg', m.el), btn = $('#d-go', m.el);
        const why = $('#d-why', m.el).value.trim();
        const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
        if (!why) return fail('Indique o motivo.');
        if ($('#d-conf', m.el).value.trim() !== 'ELIMINAR') return fail('Escreva ELIMINAR para confirmar.');
        btn.disabled = true; btn.textContent = 'A eliminar...';
        const fn = { mov: 'delete_movements', att: 'delete_attendance', inv: 'delete_inventories' }[st.tipo];
        const { data, error } = await db.rpc(fn, { p_obra: st.obra, p_ids: Array.from(st.sel), p_reason: why });
        if (error) { fail(errMsg(error)); btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; return; }
        m.close(); toast(data + ' registo(s) eliminado(s).'); load(true);
      });
    });
    await load(true);
  } catch (e) { showFatal(e); }
})();
