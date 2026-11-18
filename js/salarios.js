// Salário de cada funcionário (histórico nunca é alterado: cada mudança é um novo registo).
bootObraPage('salarios', ['payroll'], async (ctx, content, obraId) => {
  let rows = [], q = '', onlyNo = false;
  content.innerHTML =
    '<h1>Salários</h1><p class="sub">Salário em vigor de cada funcionário activo. Só vê quem tem permissão de salários.</p>' +
    '<div class="filters"><div class="field"><input id="f-q" placeholder="Nome, código ou cargo" aria-label="Pesquisar"></div></div>' +
    '<label class="check"><input type="checkbox" id="f-no"> Mostrar só quem não tem salário definido</label>' +
    '<div id="list" class="loading" style="margin-top:8px">A carregar...</div>';
  $('#f-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
  $('#f-no').addEventListener('change', e => { onlyNo = e.target.checked; draw(); });
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) openEmp(rows.find(x => x.id === b.dataset.id));
  });

  async function load() {
    const list = $('#list');
    try {
      const { data, error } = await db.rpc('salary_overview', { p_obra: obraId });
      if (error) throw error;
      rows = data; draw();
    } catch (e) { list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
  }

  function draw() {
    const list = $('#list'); list.className = '';
    const v = rows.filter(r => (!q || (r.full_name + ' ' + r.code + ' ' + (r.position || '')).toLowerCase().includes(q)) && (!onlyNo || !r.pay_type));
    const semSal = rows.filter(r => !r.pay_type).length;
    list.innerHTML = (semSal ? '<div class="alert alert-error">' + semSal + ' funcionário(s) sem salário definido. Não entram na folha.</div>' : '') +
      (v.length ? v.map(r => '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(r.full_name) + '</span>' +
        (r.pay_type ? badge(PAY_LABEL[r.pay_type], 'ok') : badge('Sem salário', 'warn')) + '</div><div class="s">' + esc(r.code) + ' · ' + esc(r.position || '') +
        (r.pay_type ? ' · ' + esc(fmtMoney(r.amount)) + ' ' + PAY_UNIT[r.pay_type] + ' desde ' + esc(fmtDate(r.effective_from)) : '') + '</div></button>').join('')
        : '<div class="empty">Nenhum funcionário encontrado.</div>');
  }

  async function openEmp(r) {
    if (!r) return;
    const m = openModal(r.full_name,
      '<div class="kv"><span>Código</span><span>' + esc(r.code) + '</span></div><div class="kv"><span>Cargo</span><span>' + esc(r.position || '') + '</span></div>' +
      '<div class="kv"><span>Salário em vigor</span><span>' + (r.pay_type ? esc(fmtMoney(r.amount) + ' ' + PAY_UNIT[r.pay_type]) : 'Não definido') + '</span></div>' +
      '<div class="section-title">Definir novo salário</div><div id="s-msg"></div>' +
      '<div class="field"><label for="s-type">Tipo</label><select id="s-type"><option value="mensal">Mensal</option><option value="diario">Diário</option><option value="hora">Por hora</option></select></div>' +
      '<div class="field"><label for="s-amt">Valor (MT)</label><input id="s-amt" inputmode="decimal" placeholder="0,00"></div>' +
      '<div class="field"><label for="s-from">A partir de</label><input id="s-from" type="date" value="' + todayISO() + '"></div>' +
      '<div class="field"><label for="s-obs">Observação (opcional)</label><input id="s-obs"></div>' +
      '<button class="btn btn-primary btn-block" id="s-save">Guardar salário</button>' +
      '<div class="section-title">Histórico</div><div id="s-hist" class="loading">A carregar...</div>');
    if (r.pay_type) $('#s-type', m.el).value = r.pay_type;

    async function history() {
      const box = $('#s-hist', m.el);
      const { data, error } = await db.from('employee_salaries').select('pay_type,amount,effective_from,notes')
        .eq('employee_id', r.id).order('effective_from', { ascending: false }).limit(20);
      box.className = '';
      box.innerHTML = error ? '<div class="alert alert-error">' + esc(errMsg(error)) + '</div>'
        : data.length ? data.map(h => '<div class="kv"><span>' + esc(fmtDate(h.effective_from)) + '</span><span>' + esc(PAY_LABEL[h.pay_type] + ' · ' + fmtMoney(h.amount)) +
          (h.notes ? ' · ' + esc(h.notes) : '') + '</span></div>').join('') : '<div class="s" style="color:var(--muted)">Sem registos.</div>';
    }
    history();

    $('#s-save', m.el).addEventListener('click', async () => {
      const msg = $('#s-msg', m.el), btn = $('#s-save', m.el);
      const amt = parseQty($('#s-amt', m.el).value), from = $('#s-from', m.el).value;
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      if (!(amt >= 0) || $('#s-amt', m.el).value.trim() === '') return fail('Indique o valor.');
      if (!from) return fail('Indique a data de início.');
      btn.disabled = true;
      const { error } = await db.rpc('set_salary', { p_obra: obraId, p_employee: r.id, p_type: $('#s-type', m.el).value,
        p_amount: amt, p_from: from, p_notes: $('#s-obs', m.el).value.trim() || null });
      btn.disabled = false;
      if (error) return fail(errMsg(error));
      m.close(); toast('Salário guardado.'); load();
    });
  }
  await load();
});
