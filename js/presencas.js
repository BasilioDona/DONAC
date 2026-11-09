bootObraPage('presencas', ['staff'], async (ctx, content, obraId) => {
  const st = { date: todayISO(), rows: [], dirty: new Set(), q: '', shown: 60 };
  const OPTS = [['presente', 'Presente'], ['falta_pendente', 'Falta pendente de justificação'],
    ['falta_justificada', 'Falta justificada'], ['falta_injustificada', 'Falta injustificada']];

  content.innerHTML =
    '<h1>Presenças</h1><p class="sub">Registo diário de vários funcionários no mesmo ecrã</p>' +
    '<div class="filters"><div class="field"><label for="p-date">Data</label><input id="p-date" type="date"></div></div>' +
    '<div id="sum" class="card" style="margin-bottom:12px"></div><div id="msg"></div>' +
    '<div class="filters"><div class="field"><input id="p-q" placeholder="Filtrar por nome ou código" aria-label="Filtrar"></div></div>' +
    '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="p-all">Marcar sem registo como presentes</button></div>' +
    '<div id="rows" class="loading">A carregar...</div><div id="more"></div>' +
    '<div class="btn-row"><button class="btn btn-primary btn-block" id="p-save">Guardar presenças</button></div>';
  $('#p-date').value = st.date;
  const msg = (t, ok) => { const b = $('#msg'); b.className = 'alert ' + (ok ? 'alert-ok' : 'alert-error'); b.textContent = t; };

  async function load() {
    $('#rows').className = 'loading'; $('#rows').textContent = 'A carregar...';
    try {
      const [e, a] = await Promise.all([
        db.from('employees').select('id,code,full_name').eq('obra_id', obraId).eq('status', 'activo').order('full_name').limit(500),
        db.from('attendance').select('employee_id,status,check_in,check_out,late_minutes,early_leave,overtime_hours,notes')
          .eq('obra_id', obraId).eq('work_date', st.date).limit(500)]);
      if (e.error) throw e.error; if (a.error) throw a.error;
      const byEmp = new Map(a.data.map(x => [x.employee_id, x]));
      st.rows = e.data.map(emp => {
        const r = byEmp.get(emp.id);
        return { id: emp.id, code: emp.code, name: emp.full_name, saved: !!r, status: r ? r.status : '',
          locked: !!r && (r.status === 'ferias' || r.status === 'licenca'),
          cin: r && r.check_in ? hhmm(r.check_in) : '', cout: r && r.check_out ? hhmm(r.check_out) : '',
          late: r && r.late_minutes ? String(r.late_minutes) : '', early: !!(r && r.early_leave),
          ot: r && Number(r.overtime_hours) ? String(r.overtime_hours) : '', notes: r && r.notes ? r.notes : '' };
      });
      st.dirty.clear(); st.shown = 60; draw();
    } catch (err) {
      $('#rows').className = ''; $('#rows').innerHTML = '<div class="alert alert-error">' + esc(errMsg(err)) + '</div>';
    }
  }

  function summary() {
    const c = s => st.rows.filter(r => r.status === s).length;
    const faltas = st.rows.filter(r => r.status.startsWith('falta_')).length;
    const free = st.rows.filter(r => r.status === '').length;
    $('#sum').innerHTML = '<div class="kv"><span>Presentes</span><span>' + c('presente') + '</span></div>' +
      '<div class="kv"><span>Faltas</span><span>' + faltas + '</span></div>' +
      '<div class="kv"><span>Férias / licença</span><span>' + (c('ferias') + c('licenca')) + '</span></div>' +
      '<div class="kv" style="border:0"><span>Sem registo</span><span>' + free + '</span></div>';
  }

  function rowHtml(r) {
    if (r.locked) return '<div class="card" style="margin-bottom:10px"><div style="font-weight:600">' + esc(r.name) + ' <span style="color:var(--muted);font-weight:400">' +
      esc(r.code) + '</span></div><div style="margin-top:6px">' + badge(ATT_LABEL[r.status], '') + ' <span style="color:var(--muted);font-size:13px">Gerido em Férias</span></div></div>';
    const opts = (r.saved ? '' : '<option value=""' + (r.status === '' ? ' selected' : '') + '>Sem registo</option>') +
      OPTS.map(o => '<option value="' + o[0] + '"' + (r.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    return '<div class="card" style="margin-bottom:10px" data-id="' + esc(r.id) + '"><div style="font-weight:600;margin-bottom:8px">' + esc(r.name) +
      ' <span style="color:var(--muted);font-weight:400">' + esc(r.code) + '</span></div>' +
      '<select class="inp" data-f="status" aria-label="Estado">' + opts + '</select>' +
      '<div class="dp" style="display:' + (r.status === 'presente' ? 'block' : 'none') + '"><div class="g2">' +
      '<div><label>Entrada</label><input class="inp" type="time" data-f="cin" value="' + esc(r.cin) + '"></div>' +
      '<div><label>Saída</label><input class="inp" type="time" data-f="cout" value="' + esc(r.cout) + '"></div>' +
      '<div><label>Atraso (min)</label><input class="inp" inputmode="numeric" data-f="late" value="' + esc(r.late) + '"></div>' +
      '<div><label>Horas extras</label><input class="inp" inputmode="decimal" data-f="ot" value="' + esc(r.ot) + '"></div></div>' +
      '<label class="check"><input type="checkbox" data-f="early"' + (r.early ? ' checked' : '') + '> Saída antecipada</label></div>' +
      '<div class="dn" style="display:' + (r.status ? 'block' : 'none') + ';margin-top:8px"><input class="inp" data-f="notes" placeholder="Observação (opcional)" value="' + esc(r.notes) + '"></div></div>';
  }

  function draw() {
    const q = st.q.toLowerCase();
    const v = st.rows.filter(r => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    const box = $('#rows'); box.className = '';
    box.innerHTML = v.length ? v.slice(0, st.shown).map(rowHtml).join('') : '<div class="empty">Nenhum funcionário activo. Registe funcionários primeiro.</div>';
    $('#more').innerHTML = v.length > st.shown ? '<button class="btn btn-block" id="p-more">Mostrar mais (' + (v.length - st.shown) + ')</button>' : '';
    const pm = $('#p-more'); if (pm) pm.addEventListener('click', () => { st.shown += 60; draw(); });
    summary();
  }

  $('#rows').addEventListener('input', onEdit);
  $('#rows').addEventListener('change', onEdit);
  function onEdit(e) {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const r = st.rows.find(x => x.id === card.dataset.id), f = e.target.dataset.f;
    if (!r || !f) return;
    if (f === 'early') r.early = e.target.checked;
    else r[f] = e.target.value;
    if (f === 'status') {
      card.querySelector('.dp').style.display = r.status === 'presente' ? 'block' : 'none';
      card.querySelector('.dn').style.display = r.status ? 'block' : 'none';
      summary();
    }
    st.dirty.add(r.id);
  }

  $('#p-q').addEventListener('input', e => { st.q = e.target.value; st.shown = 60; draw(); });
  $('#p-all').addEventListener('click', () => {
    st.rows.forEach(r => { if (!r.saved && !r.locked && r.status === '') { r.status = 'presente'; st.dirty.add(r.id); } });
    draw();
  });
  $('#p-date').addEventListener('change', e => {
    if (!e.target.value) { e.target.value = st.date; return; }
    if (st.dirty.size && !confirm('Há alterações por guardar. Continuar e perdê-las?')) { e.target.value = st.date; return; }
    st.date = e.target.value; load();
  });

  $('#p-save').addEventListener('click', async () => {
    const btn = $('#p-save');
    const payload = [];
    for (const r of st.rows) {
      if (!st.dirty.has(r.id) || r.locked || r.status === '') continue;
      const late = r.late === '' ? 0 : parseInt(r.late, 10), ot = r.ot === '' ? 0 : parseQty(r.ot);
      if (r.status === 'presente' && (!(late >= 0) || !(ot >= 0))) { msg('Verifique atraso e horas extras de ' + r.name + '.'); return; }
      payload.push({ employee_id: r.id, status: r.status, check_in: r.cin || null, check_out: r.cout || null,
        late_minutes: late, early_leave: r.early, overtime_hours: ot, notes: r.notes });
    }
    if (!payload.length) { msg('Não há alterações para guardar.'); return; }
    btn.disabled = true; btn.textContent = 'A guardar...';
    const { data, error } = await db.rpc('save_attendance', { p_obra: obraId, p_date: st.date, p_rows: payload });
    btn.disabled = false; btn.textContent = 'Guardar presenças';
    if (error) { msg(errMsg(error)); return; }
    payload.forEach(p => { const r = st.rows.find(x => x.id === p.employee_id); if (r) r.saved = true; });
    st.dirty.clear();
    msg('Guardado: ' + data.saved + ' registo(s)' + (data.skipped ? '. Ignorados: ' + data.skipped + ' (em férias/licença ou inactivos).' : '.'), true);
    draw();
  });

  await load();
});
