bootObraPage('ferias', ['staff'], async (ctx, content, obraId) => {
  const LEAVE = { ferias: 'Férias', licenca: 'Licença' };
  let groups = [];

  content.innerHTML =
    '<div class="row"><div><h1>Férias e licenças</h1><p class="sub" style="margin:0">Últimos 30 dias e próximos 6 meses</p></div>' +
    '<button class="btn btn-primary" id="btn-new">Registar</button></div><div id="list" class="loading">A carregar...</div>';
  $('#btn-new').addEventListener('click', openForm);
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (b) openGroup(groups[Number(b.dataset.g)]);
  });

  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const gap = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;

  async function load() {
    const list = $('#list');
    try {
      const t = todayISO();
      const { data, error } = await db.from('attendance').select('employee_id,work_date,status,employees(code,full_name)')
        .eq('obra_id', obraId).in('status', ['ferias', 'licenca'])
        .gte('work_date', addDays(t, -30)).lte('work_date', addDays(t, 180))
        .order('work_date').limit(1000);
      if (error) throw error;
      const rows = data.slice().sort((a, b) => a.employee_id.localeCompare(b.employee_id) || a.status.localeCompare(b.status) || a.work_date.localeCompare(b.work_date));
      groups = [];
      for (const r of rows) {
        const g = groups[groups.length - 1];
        if (g && g.emp === r.employee_id && g.status === r.status && gap(g.to, r.work_date) <= 3) { g.to = r.work_date; g.days++; }
        else groups.push({ emp: r.employee_id, status: r.status, from: r.work_date, to: r.work_date, days: 1, e: empOf(r) || {} });
      }
      groups.sort((a, b) => a.from.localeCompare(b.from));
      list.className = '';
      list.innerHTML = groups.length ? groups.map((g, i) =>
        '<button class="item" data-g="' + i + '"><div class="t"><span>' + esc(g.e.full_name || '') + '</span>' + badge(LEAVE[g.status], g.to < t ? 'muted' : 'ok') +
        '</div><div class="s">' + esc(fmtDate(g.from)) + ' a ' + esc(fmtDate(g.to)) + ' · ' + g.days + ' dia(s)</div></button>').join('')
        : '<div class="empty">Sem férias ou licenças neste período.</div>';
    } catch (e) {
      list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }

  function openGroup(g) {
    const m = openModal(LEAVE[g.status] + ' · ' + (g.e.full_name || ''),
      '<div class="kv"><span>Funcionário</span><span>' + esc((g.e.code || '') + ' · ' + (g.e.full_name || '')) + '</span></div>' +
      '<div class="kv"><span>Período</span><span>' + esc(fmtDate(g.from)) + ' a ' + esc(fmtDate(g.to)) + '</span></div>' +
      '<div class="kv"><span>Dias registados</span><span>' + g.days + '</span></div><div id="g-msg"></div>' +
      '<p class="sub" style="margin-top:12px">Só é possível cancelar os dias que ainda não aconteceram. Os dias passados ficam no histórico.</p>' +
      '<button class="btn btn-danger btn-block" id="g-cancel">Cancelar dias futuros</button>');
    $('#g-cancel', m.el).addEventListener('click', async () => {
      if (!confirm('Cancelar os dias futuros desta ' + LEAVE[g.status].toLowerCase() + '?')) return;
      const { data, error } = await db.rpc('cancel_leave', { p_obra: obraId, p_employee: g.emp, p_from: g.from, p_to: g.to });
      if (error) { const x = $('#g-msg', m.el); x.className = 'alert alert-error'; x.textContent = errMsg(error); return; }
      m.close(); toast(data + ' dia(s) cancelado(s).'); load();
    });
  }

  function openForm() {
    const m = openModal('Registar férias ou licença',
      '<div id="l-msg"></div><div id="l-pick"></div>' +
      '<div class="field"><label for="l-type">Tipo</label><select id="l-type"><option value="ferias">Férias</option><option value="licenca">Licença</option></select></div>' +
      '<div class="field"><label for="l-from">De</label><input id="l-from" type="date" value="' + todayISO() + '"></div>' +
      '<div class="field"><label for="l-to">Até</label><input id="l-to" type="date" value="' + todayISO() + '"></div>' +
      '<label class="check"><input type="checkbox" id="l-sat"> Contar sábados</label>' +
      '<label class="check"><input type="checkbox" id="l-sun"> Contar domingos</label>' +
      '<div class="field" style="margin-top:8px"><label for="l-obs">Observação (opcional)</label><input id="l-obs"></div>' +
      '<button class="btn btn-primary btn-block" id="l-save">Registar</button>');
    const picker = employeePicker($('#l-pick', m.el), obraId);
    $('#l-save', m.el).addEventListener('click', async () => {
      const msg = $('#l-msg', m.el), btn = $('#l-save', m.el), emp = picker.get();
      const from = $('#l-from', m.el).value, to = $('#l-to', m.el).value;
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      if (!emp) return fail('Seleccione o funcionário.');
      if (!from || !to || from > to) return fail('Período inválido.');
      btn.disabled = true;
      const { data, error } = await db.rpc('set_leave', { p_obra: obraId, p_employee: emp.id, p_type: $('#l-type', m.el).value,
        p_from: from, p_to: to, p_notes: $('#l-obs', m.el).value.trim() || null,
        p_skip_sat: !$('#l-sat', m.el).checked, p_skip_sun: !$('#l-sun', m.el).checked });
      if (error) { fail(errMsg(error)); btn.disabled = false; return; }
      m.close();
      toast('Registados ' + data.created + ' dia(s)' + (data.skipped ? '. Ignorados (já com registo): ' + data.skipped + '.' : '.'));
      load();
    });
  }
  await load();
});
