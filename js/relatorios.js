const PAGE = 30;
const st = { page: 0, rows: [], more: false, def: null, p: null };

bootObraPage('relatorios', ['staff', 'reports', 'warehouse', 'inventory'], async (ctx, content, obraId) => {
  const canS = can(ctx, 'staff') || can(ctx, 'reports');
  const canW = can(ctx, 'warehouse') || can(ctx, 'inventory') || can(ctx, 'reports');
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const first = a => Array.isArray(a) ? a[0] : a;
  const D = {};

  // ---------- definições: Pessoal ----------
  const attHead = ['Data', 'Funcionário', 'Estado', 'Entrada', 'Saída', 'Atraso (min)', 'Horas extras', 'Observação'];
  const attRow = r => { const e = empOf(r) || {}; return [fmtDate(r.work_date), e.full_name || '', ATT_LABEL[r.status] || r.status,
    hhmm(r.check_in), hhmm(r.check_out), r.late_minutes, Number(r.overtime_hours), r.notes || '']; };
  const attQuery = extra => p => extra(db.from('attendance').select(ATT_COLS + ',employee_id').eq('obra_id', obraId)
    .gte('work_date', p.from).lte('work_date', p.to).order('work_date', { ascending: false }).order('id'));
  const attDetail = r => { const x = empOf(r) || {}; openModal(x.full_name || '',
    '<div class="kv"><span>Data</span><span>' + esc(fmtDate(r.work_date)) + '</span></div>' +
    '<div class="kv"><span>Estado</span><span>' + esc(ATT_LABEL[r.status]) + '</span></div>' +
    '<div class="kv"><span>Entrada / Saída</span><span>' + esc((hhmm(r.check_in) || '—') + ' / ' + (hhmm(r.check_out) || '—')) + '</span></div>' +
    '<div class="kv"><span>Atraso</span><span>' + esc(r.late_minutes + ' min') + '</span></div>' +
    '<div class="kv"><span>Horas extras</span><span>' + esc(fmtNum(r.overtime_hours)) + '</span></div>' +
    (r.notes ? '<div class="kv"><span>Observação</span><span>' + esc(r.notes) + '</span></div>' : '')); };

  if (canS) {
    D.resumo = { group: 'Pessoal', label: 'Resumo por funcionário', kind: 'rpc',
      head: ['Código', 'Funcionário', 'Presenças', 'Faltas justificadas', 'Faltas injustificadas', 'Faltas pendentes', 'Atrasos', 'Minutos de atraso', 'Horas extras', 'Dias de férias', 'Dias de licença'],
      row: r => [r.code, r.full_name, r.presentes, r.faltas_justificadas, r.faltas_injustificadas, r.faltas_pendentes, r.atrasos, Number(r.minutos_atraso), Number(r.horas_extras), r.ferias, r.licencas],
      run: async p => { const { data, error } = await db.rpc('staff_summary', { p_obra: obraId, p_from: p.from, p_to: p.to }); if (error) throw error; return data; },
      render: rows => {
        const sum = k => rows.reduce((s, r) => s + Number(r[k]), 0);
        return '<div class="card" style="margin-bottom:12px"><div class="kv"><span>Funcionários</span><span>' + rows.length + '</span></div>' +
          '<div class="kv"><span>Presenças</span><span>' + sum('presentes') + '</span></div>' +
          '<div class="kv"><span>Faltas</span><span>' + (sum('faltas_justificadas') + sum('faltas_injustificadas') + sum('faltas_pendentes')) + '</span></div>' +
          '<div class="kv"><span>Atrasos</span><span>' + sum('atrasos') + ' (' + sum('minutos_atraso') + ' min)</span></div>' +
          '<div class="kv" style="border:0"><span>Horas extras</span><span>' + esc(fmtNum(sum('horas_extras'))) + '</span></div></div>' +
          rows.map(r => '<div class="card" style="margin-bottom:10px"><div style="font-weight:600">' + esc(r.full_name) + ' <span style="color:var(--muted);font-weight:400">' + esc(r.code) + '</span></div>' +
            '<div class="kv"><span>Presenças</span><span>' + r.presentes + '</span></div>' +
            '<div class="kv"><span>Faltas (just. / injust. / pend.)</span><span>' + r.faltas_justificadas + ' / ' + r.faltas_injustificadas + ' / ' + r.faltas_pendentes + '</span></div>' +
            '<div class="kv"><span>Atrasos</span><span>' + r.atrasos + ' (' + r.minutos_atraso + ' min)</span></div>' +
            '<div class="kv"><span>Horas extras</span><span>' + esc(fmtNum(r.horas_extras)) + '</span></div>' +
            '<div class="kv" style="border:0"><span>Férias / licença (dias)</span><span>' + r.ferias + ' / ' + r.licencas + '</span></div></div>').join('');
      } };
    const L = (label, extra, needEmp) => ({ group: 'Pessoal', label, kind: 'list', needEmp, query: attQuery(extra), head: attHead, row: attRow, item: attItem, detail: attDetail });
    D.presencas = L('Presenças', q => q.eq('status', 'presente'));
    D.faltas = L('Faltas', q => q.in('status', FALTAS));
    D.atrasos = L('Atrasos', q => q.gt('late_minutes', 0));
    D.extras = L('Horas extras', q => q.gt('overtime_hours', 0));
    D.individual = L('Histórico individual', q => q.eq('employee_id', picker.get().id), true);
  }

  // ---------- definições: Armazém ----------
  if (canW) {
    const movQuery = type => p => { let q = db.from('stock_movements').select(MOV_COLS).eq('obra_id', obraId)
      .gte('movement_date', p.from).lte('movement_date', p.to)
      .order('movement_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
      return type ? q.eq('type', type) : q; };
    const movHead = ['Data', 'Tipo', 'Código', 'Material', 'Quantidade', 'Unidade', 'Stock anterior', 'Stock posterior', 'Responsável', 'Observação'];
    const movRow = r => { const m = first(r.materials) || {}; const neg = r.type === 'saida' || (r.type === 'ajuste' && Number(r.quantity) < 0);
      return [fmtDate(r.movement_date), TYPE_LABEL[r.type], m.code || '', m.name || '', (neg ? -1 : 1) * Math.abs(Number(r.quantity)), m.unit || '',
        Number(r.stock_before), Number(r.stock_after), r.received_by || r.authorized_by || r.purpose || '', r.notes || '']; };
    const M = (label, type) => ({ group: 'Armazém', label, kind: 'list', query: movQuery(type), head: movHead, row: movRow, item: movementItem,
      detail: r => movementDetail(r) });
    D.stock = { group: 'Armazém', label: 'Stock actual', kind: 'list', noPeriod: true,
      query: () => db.from('materials').select('id,code,name,unit,stock,min_stock,location,material_categories(name)').eq('obra_id', obraId).eq('active', true).order('name').order('id'),
      head: ['Código', 'Material', 'Categoria', 'Unidade', 'Stock', 'Stock mínimo', 'Localização'],
      row: r => [r.code, r.name, (first(r.material_categories) || {}).name || '', r.unit, Number(r.stock), Number(r.min_stock), r.location || ''],
      item: r => '<div class="card" style="margin-bottom:10px"><div style="font-weight:600">' + esc(r.code + ' · ' + r.name) + ' ' + stockBadge(r) + '</div>' +
        '<div class="s" style="color:var(--muted);font-size:13px;margin-top:3px">' + esc(fmtNum(r.stock) + ' ' + r.unit) + ' · mín. ' + esc(fmtNum(r.min_stock)) + (r.location ? ' · ' + esc(r.location) : '') + '</div></div>' };
    D.entradas = M('Entradas', 'entrada');
    D.saidas = M('Saídas', 'saida');
    D.movimentos = M('Todas as movimentações', null);
    D.inventarios = { group: 'Armazém', label: 'Inventários', kind: 'list',
      query: p => db.from('inventory_sessions').select('id,status,notes,started_at,confirmed_at').eq('obra_id', obraId)
        .gte('started_at', p.from).lte('started_at', p.to + 'T23:59:59').order('started_at', { ascending: false }).order('id'),
      head: ['Início', 'Estado', 'Confirmado em', 'Observação'],
      row: r => [fmtDate(r.started_at), { aberto: 'Em curso', confirmado: 'Confirmado', cancelado: 'Cancelado' }[r.status], r.confirmed_at ? fmtDate(r.confirmed_at) : '', r.notes || ''],
      item: r => '<div class="card" style="margin-bottom:10px"><div class="t" style="font-weight:600;display:flex;justify-content:space-between"><span>' + esc(fmtDate(r.started_at)) + '</span>' +
        badge({ aberto: 'Em curso', confirmado: 'Confirmado', cancelado: 'Cancelado' }[r.status], { aberto: 'warn', confirmado: 'ok', cancelado: 'muted' }[r.status]) + '</div>' +
        (r.notes ? '<div class="s" style="color:var(--muted);font-size:13px">' + esc(r.notes) + '</div>' : '') + '</div>' };
    D.diferencas = { group: 'Armazém', label: 'Diferenças de stock (inventários confirmados)', kind: 'list',
      query: p => db.from('inventory_items').select('id,system_stock,counted_stock,difference,justification,materials(code,name,unit),inventory_sessions!inner(status,confirmed_at)')
        .eq('obra_id', obraId).eq('inventory_sessions.status', 'confirmado')
        .gte('inventory_sessions.confirmed_at', p.from).lte('inventory_sessions.confirmed_at', p.to + 'T23:59:59').neq('difference', 0).order('id'),
      head: ['Confirmado em', 'Código', 'Material', 'Unidade', 'Stock no sistema', 'Stock contado', 'Diferença', 'Justificação'],
      row: r => { const m = first(r.materials) || {}, s = first(r.inventory_sessions) || {};
        return [s.confirmed_at ? fmtDate(s.confirmed_at) : '', m.code || '', m.name || '', m.unit || '', Number(r.system_stock), Number(r.counted_stock), Number(r.difference), r.justification || '']; },
      item: r => { const m = first(r.materials) || {}, d = Number(r.difference);
        return '<div class="card" style="margin-bottom:10px"><div style="font-weight:600">' + esc((m.code || '') + ' · ' + (m.name || '')) + '</div>' +
          '<div class="kv"><span>Sistema / Contado</span><span>' + esc(fmtNum(r.system_stock) + ' / ' + fmtNum(r.counted_stock) + ' ' + (m.unit || '')) + '</span></div>' +
          '<div class="kv" style="border:0"><span>Diferença</span><span style="color:var(--red)">' + (d > 0 ? '+' : '−') + esc(fmtNum(Math.abs(d))) + '</span></div>' +
          (r.justification ? '<div class="s" style="color:var(--muted);font-size:13px">' + esc(r.justification) + '</div>' : '') + '</div>'; } };
  }

  // ---------- ecrã ----------
  const groups = {};
  Object.entries(D).forEach(([id, d]) => { (groups[d.group] = groups[d.group] || []).push([id, d.label]); });
  content.innerHTML =
    '<h1>Relatórios</h1><p class="sub">Escolha o relatório e o período. A exportação só é feita quando pedida.</p>' +
    '<div class="card"><div class="field"><label for="r-type">Relatório</label><select id="r-type">' +
    Object.entries(groups).map(([g, l]) => '<optgroup label="' + esc(g) + '">' + l.map(x => '<option value="' + x[0] + '">' + esc(x[1]) + '</option>').join('') + '</optgroup>').join('') +
    '</select></div><div id="r-emp" style="display:none"></div>' +
    '<div id="r-period"><div class="btn-row" style="margin:0 0 12px"><button class="btn" data-p="today">Hoje</button><button class="btn" data-p="week">Esta semana</button><button class="btn" data-p="month">Este mês</button></div>' +
    '<div class="filters"><div class="field"><label for="r-from">De</label><input id="r-from" type="date"></div>' +
    '<div class="field"><label for="r-to">Até</label><input id="r-to" type="date"></div></div></div>' +
    '<button class="btn btn-primary btn-block" id="r-go">Gerar relatório</button></div><div id="out" style="margin-top:14px"></div>';
  const printArea = document.createElement('div'); printArea.id = 'print-area'; document.body.appendChild(printArea);

  $('#r-from').value = monthStartISO(); $('#r-to').value = todayISO();
  const picker = employeePicker($('#r-emp'), obraId);
  const sync = () => { const d = D[$('#r-type').value]; $('#r-emp').style.display = d && d.needEmp ? 'block' : 'none'; $('#r-period').style.display = d && d.noPeriod ? 'none' : 'block'; };
  $('#r-type').addEventListener('change', sync); sync();

  content.addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const now = new Date(); let a = new Date(now);
    if (b.dataset.p === 'week') a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    if (b.dataset.p === 'month') a = new Date(now.getFullYear(), now.getMonth(), 1);
    $('#r-from').value = iso(a); $('#r-to').value = iso(now);
  });
  $('#r-go').addEventListener('click', generate);
  $('#out').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b || !st.def || !st.def.detail) return;
    const r = st.rows.find(x => x.id === b.dataset.id);
    if (r) st.def.detail(r);
  });

  async function loadPage() {
    const from = st.page * PAGE;
    const { data, error } = await st.def.query(st.p).range(from, from + PAGE - 1);
    if (error) throw error;
    st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
  }

  function draw() {
    const d = st.def, out = $('#out');
    const title = '<div class="row" style="margin-bottom:8px"><div class="section-title" style="margin:0">' + esc(d.label) +
      (d.noPeriod ? '' : ' · ' + esc(fmtDate(st.p.from) + ' a ' + fmtDate(st.p.to))) + '</div></div>';
    const exp = st.rows.length ? '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="x-csv">Exportar Excel (CSV)</button><button class="btn" id="x-pdf">Guardar PDF / Imprimir</button></div>' : '';
    out.innerHTML = title + exp + (st.rows.length ? (d.kind === 'rpc' ? d.render(st.rows) : st.rows.map(d.item).join('')) : '<div class="empty">Sem registos para este período.</div>') +
      (st.more ? '<button class="btn btn-block" id="r-more">Carregar mais</button>' : '');
    const bm = $('#r-more');
    if (bm) bm.addEventListener('click', async () => { bm.disabled = true; try { await loadPage(); draw(); } catch (e) { toast(errMsg(e), 'error'); bm.disabled = false; } });
    const xc = $('#x-csv'); if (xc) xc.addEventListener('click', exportCSV);
    const xp = $('#x-pdf'); if (xp) xp.addEventListener('click', exportPDF);
  }

  async function generate() {
    const type = $('#r-type').value, d = D[type];
    const p = { from: $('#r-from').value, to: $('#r-to').value };
    if (!d.noPeriod) {
      if (!p.from || !p.to || p.from > p.to) { toast('Período inválido.', 'error'); return; }
      if ((Date.parse(p.to) - Date.parse(p.from)) / 86400000 > 366) { toast('O período máximo é 1 ano.', 'error'); return; }
    }
    if (d.needEmp && !picker.get()) { toast('Seleccione o funcionário.', 'error'); return; }
    st.def = d; st.p = p; st.page = 0; st.rows = []; st.more = false;
    const out = $('#out'), btn = $('#r-go');
    out.innerHTML = '<div class="loading">A gerar...</div>'; btn.disabled = true;
    try {
      if (d.kind === 'rpc') st.rows = await d.run(p); else await loadPage();
      draw();
    } catch (e) { out.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
    btn.disabled = false;
  }

  // Carrega todas as linhas (máx. 5000) só quando o utilizador pede exportação
  async function getAll() {
    const d = st.def;
    if (d.kind === 'rpc') return st.rows;
    let all = [], from = 0;
    for (;;) {
      const { data, error } = await d.query(st.p).range(from, from + 999);
      if (error) throw error;
      all = all.concat(data);
      if (data.length < 1000) break;
      if (all.length >= 5000) { toast('Exportação limitada às primeiras 5000 linhas. Reduza o período.', 'error'); break; }
      from += 1000;
    }
    return all;
  }

  async function exportCSV() {
    const b = $('#x-csv'); b.disabled = true;
    try {
      const rows = (await getAll()).map(st.def.row);
      downloadCSV('donac_' + $('#r-type').value + '_' + (st.def.noPeriod ? todayISO() : st.p.from + '_' + st.p.to) + '.csv', st.def.head, rows);
    } catch (e) { toast(errMsg(e), 'error'); }
    b.disabled = false;
  }

  async function exportPDF() {
    const b = $('#x-pdf'); b.disabled = true;
    try {
      const rows = (await getAll()).map(st.def.row);
      printArea.innerHTML = '<h1>DONAC · ' + esc(st.def.label) + '</h1><p>' + esc(ctx.membership.obra_name) +
        (st.def.noPeriod ? '' : ' · ' + esc(fmtDate(st.p.from) + ' a ' + fmtDate(st.p.to))) + ' · Emitido em ' + esc(fmtDate(todayISO())) + ' por ' + esc(ctx.full_name) + '</p>' +
        '<table><thead><tr>' + st.def.head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + esc(typeof c === 'number' ? fmtNum(c) : c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      document.body.classList.add('printing');
      window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); printArea.innerHTML = ''; }, { once: true });
      window.print();
    } catch (e) { toast(errMsg(e), 'error'); }
    b.disabled = false;
  }
});
