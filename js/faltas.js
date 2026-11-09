const PAGE = 20;
const st = { page: 0, rows: [], more: false, from: '', to: '', status: '' };

bootObraPage('faltas', ['staff'], async (ctx, content, obraId) => {
  st.from = monthStartISO(); st.to = todayISO();
  content.innerHTML =
    '<div class="row"><div><h1>Faltas</h1><p class="sub" style="margin:0">Registo e justificação</p></div>' +
    '<button class="btn btn-primary" id="btn-new">Registar</button></div>' +
    '<div class="filters"><div class="field"><select id="f-st" aria-label="Estado"><option value="">Todas as faltas</option>' +
    '<option value="falta_pendente">Pendentes de justificação</option><option value="falta_justificada">Justificadas</option>' +
    '<option value="falta_injustificada">Injustificadas</option></select></div></div>' +
    '<div class="filters"><div class="field"><label for="f-from">De</label><input id="f-from" type="date" value="' + st.from + '"></div>' +
    '<div class="field"><label for="f-to">Até</label><input id="f-to" type="date" value="' + st.to + '"></div></div>' +
    '<div class="btn-row" style="margin:0 0 12px"><button class="btn" id="btn-apply">Aplicar filtros</button></div>' +
    '<div id="list" class="loading">A carregar...</div><div id="more-wrap"></div>';

  $('#btn-apply').addEventListener('click', () => {
    st.status = $('#f-st').value; st.from = $('#f-from').value; st.to = $('#f-to').value; load(true);
  });
  $('#f-st').addEventListener('change', () => $('#btn-apply').click());
  $('#btn-new').addEventListener('click', openRegister);
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) { const r = st.rows.find(x => x.id === b.dataset.id); if (r) openAbsence(r); }
  });

  async function load(reset) {
    const list = $('#list');
    try {
      if (reset) { st.page = 0; st.rows = []; }
      const from = st.page * PAGE;
      let q = db.from('attendance').select(ATT_COLS).eq('obra_id', obraId)
        .in('status', st.status ? [st.status] : FALTAS)
        .order('work_date', { ascending: false }).range(from, from + PAGE - 1);
      if (st.from) q = q.gte('work_date', st.from);
      if (st.to) q = q.lte('work_date', st.to);
      const { data, error } = await q;
      if (error) throw error;
      st.rows = st.rows.concat(data); st.more = data.length === PAGE; st.page++;
      list.className = '';
      list.innerHTML = st.rows.length ? st.rows.map(attItem).join('') : '<div class="empty">Sem faltas neste período.</div>';
      $('#more-wrap').innerHTML = st.more ? '<button class="btn btn-block" id="btn-more">Carregar mais</button>' : '';
      if (st.more) $('#btn-more').addEventListener('click', () => load(false));
    } catch (e) {
      list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }

  function openAbsence(r) {
    const e = empOf(r) || {};
    const m = openModal('Falta · ' + (e.full_name || ''),
      '<div class="kv"><span>Funcionário</span><span>' + esc((e.code || '') + ' · ' + (e.full_name || '')) + '</span></div>' +
      '<div class="kv"><span>Data</span><span>' + esc(fmtDate(r.work_date)) + '</span></div>' +
      '<div class="kv"><span>Estado</span><span>' + badge(ATT_LABEL[r.status], ATT_CLS[r.status]) + '</span></div>' +
      '<div class="section-title">Alterar estado</div><div id="a-msg"></div>' +
      '<div class="field"><label for="a-notes">Observação</label><textarea id="a-notes">' + esc(r.notes || '') + '</textarea></div>' +
      FALTAS.map(s => '<button class="btn btn-block" style="margin-bottom:8px" data-s="' + s + '"' + (r.status === s ? ' disabled' : '') + '>' + ATT_LABEL[s] + '</button>').join(''));
    m.el.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-s]');
      if (!b) return;
      b.disabled = true;
      const { error } = await db.rpc('justify_absence', { p_id: r.id, p_status: b.dataset.s, p_notes: $('#a-notes', m.el).value.trim() || null });
      if (error) { const x = $('#a-msg', m.el); x.className = 'alert alert-error'; x.textContent = errMsg(error); b.disabled = false; return; }
      m.close(); toast('Estado actualizado.'); load(true);
    });
  }

  function openRegister() {
    const m = openModal('Registar falta',
      '<div id="r-msg"></div><div id="r-pick"></div>' +
      '<div class="field"><label for="r-date">Data da falta</label><input id="r-date" type="date" value="' + todayISO() + '"></div>' +
      '<div class="field"><label for="r-type">Estado da justificação</label><select id="r-type">' +
      FALTAS.map(s => '<option value="' + s + '">' + ATT_LABEL[s] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="r-obs">Observação (opcional)</label><textarea id="r-obs"></textarea></div>' +
      '<button class="btn btn-primary btn-block" id="r-save">Registar falta</button>');
    const picker = employeePicker($('#r-pick', m.el), obraId);
    $('#r-save', m.el).addEventListener('click', async () => {
      const msg = $('#r-msg', m.el), btn = $('#r-save', m.el), emp = picker.get(), date = $('#r-date', m.el).value;
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      if (!emp) return fail('Seleccione o funcionário.');
      if (!date) return fail('Indique a data.');
      btn.disabled = true;
      const { data, error } = await db.rpc('save_attendance', { p_obra: obraId, p_date: date,
        p_rows: [{ employee_id: emp.id, status: $('#r-type', m.el).value, notes: $('#r-obs', m.el).value.trim() }] });
      if (error) { fail(errMsg(error)); btn.disabled = false; return; }
      if (!data.saved) { fail('Não foi registada: o funcionário está de férias/licença nessa data.'); btn.disabled = false; return; }
      m.close(); toast('Falta registada.'); load(true);
    });
  }
  await load(true);
});
