// Folha de pagamento mensal: cálculo, ajustes, fecho, pagamento, mapa e recibos.
bootObraPage('folha', ['payroll'], async (ctx, content, obraId) => {
  const obraName = ctx.membership.obra_name;
  const first = a => Array.isArray(a) ? a[0] : a;
  const num = v => Number(v || 0);
  const monthName = p => {
    const [y, m] = String(p).slice(0, 10).split('-');
    const s = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // abre um documento HTML: no navegador abre e imprime; na app guarda o ficheiro
  function openDoc(filename, html) {
    if (isAppWebView()) { saveTextFile(filename, html, 'text/html;charset=utf-8'); return; }
    const w = window.open('', '_blank');
    if (!w) { saveTextFile(filename, html, 'text/html;charset=utf-8'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ---------- lista de folhas ----------
  async function showList() {
    content.innerHTML = '<div class="row"><div><h1>Folha de pagamento</h1><p class="sub" style="margin:0">Cálculo mensal dos salários</p></div>' +
      '<button class="btn btn-primary" id="btn-new">Nova folha</button></div><div id="list" class="loading">A carregar...</div>';
    $('#btn-new').addEventListener('click', openNew);
    const list = $('#list');
    try {
      const { data, error } = await db.from('payroll_runs').select('id,period,status').eq('obra_id', obraId).order('period', { ascending: false }).limit(36);
      if (error) throw error;
      list.className = '';
      list.innerHTML = data.length ? data.map(r => '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(monthName(r.period)) + '</span>' +
        badge(r.status === 'fechada' ? 'Fechada' : 'Rascunho', r.status === 'fechada' ? 'ok' : 'warn') + '</div></button>').join('')
        : '<div class="empty">Ainda não há folhas. Defina primeiro os salários e crie a folha do mês.</div>';
      list.onclick = e => { const b = e.target.closest('[data-id]'); if (b) showRun(b.dataset.id); };
    } catch (e) { list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
  }

  function openNew() {
    const now = new Date(), cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const m = openModal('Nova folha',
      '<div id="n-msg"></div><div class="field"><label for="n-month">Mês</label><input id="n-month" type="month" value="' + cur + '"></div>' +
      '<div class="field"><label for="n-days">Dias de trabalho no mês (para salário mensal)</label><input id="n-days" inputmode="numeric" value="26"></div>' +
      '<div class="field"><label for="n-hours">Horas de trabalho por dia</label><input id="n-hours" inputmode="decimal" value="8"></div>' +
      '<div class="field"><label for="n-mult">Multiplicador das horas extras</label><input id="n-mult" inputmode="decimal" value="1,5"></div>' +
      '<div class="field"><label for="n-inss">Desconto INSS do trabalhador (%)</label><input id="n-inss" inputmode="decimal" value="0"></div>' +
      '<p class="hint" style="margin-top:-6px">Confirme a taxa em vigor com o seu contabilista. O IRPS, se existir, lança-se em "Outros descontos" de cada funcionário.</p>' +
      '<label class="check"><input type="checkbox" id="n-late"> Descontar atrasos (minutos de atraso pagos à hora)</label>' +
      '<div class="field" style="margin-top:8px"><label for="n-obs">Observação (opcional)</label><input id="n-obs"></div>' +
      '<button class="btn btn-primary btn-block" id="n-go">Criar e calcular</button>');
    $('#n-go', m.el).addEventListener('click', async () => {
      const msg = $('#n-msg', m.el), btn = $('#n-go', m.el);
      const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
      const month = $('#n-month', m.el).value, days = parseInt($('#n-days', m.el).value, 10);
      const hours = parseQty($('#n-hours', m.el).value), mult = parseQty($('#n-mult', m.el).value), inss = parseQty($('#n-inss', m.el).value);
      if (!month) return fail('Escolha o mês.');
      if (!(days >= 1 && days <= 31) || !(hours > 0 && hours <= 24) || !(mult >= 1) || !(inss >= 0 && inss <= 100)) return fail('Verifique os valores indicados.');
      btn.disabled = true; btn.textContent = 'A calcular...';
      const { data, error } = await db.rpc('payroll_create_run', { p_obra: obraId, p_period: month + '-01', p_days_basis: days, p_hours_per_day: hours,
        p_overtime_multiplier: mult, p_inss_pct: inss, p_deduct_late: $('#n-late', m.el).checked, p_notes: $('#n-obs', m.el).value.trim() || null });
      if (error) { fail(errMsg(error)); btn.disabled = false; btn.textContent = 'Criar e calcular'; return; }
      m.close(); showRun(data);
    });
  }

  // ---------- uma folha ----------
  async function showRun(id) {
    content.innerHTML = '<div class="loading">A carregar...</div>';
    let run, items, checks;
    try {
      const [r, i, c] = await Promise.all([
        db.from('payroll_runs').select('*').eq('id', id).eq('obra_id', obraId).single(),
        db.from('payroll_items').select('id,pay_type,rate,days_present,days_abs_just,days_abs_unjust,days_abs_pending,days_leave,overtime_hours,late_minutes,base_pay,overtime_pay,absence_deduction,late_deduction,bonus,advances,other_deductions,adj_notes,gross,inss,net,paid_at,employees(code,full_name,position)').eq('run_id', id).limit(1000),
        db.rpc('payroll_run_checks', { p_run: id })]);
      if (r.error) throw r.error; if (i.error) throw i.error; if (c.error) throw c.error;
      run = r.data; checks = c.data;
      items = i.data.sort((a, b) => ((first(a.employees) || {}).full_name || '').localeCompare((first(b.employees) || {}).full_name || '', 'pt'));
    } catch (e) {
      content.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div><button class="btn" id="back">Voltar</button>';
      $('#back').addEventListener('click', showList); return;
    }

    const draft = run.status === 'rascunho';
    const sum = k => items.reduce((s, x) => s + num(x[k]), 0);
    const paidN = items.filter(x => x.paid_at).length;
    const emp = x => first(x.employees) || {};

    content.innerHTML =
      '<div class="row"><div><h1>' + esc(monthName(run.period)) + ' ' + badge(draft ? 'Rascunho' : 'Fechada', draft ? 'warn' : 'ok') + '</h1>' +
      '<p class="sub" style="margin:0">' + esc(run.days_basis + ' dias · ' + fmtNum(run.hours_per_day) + ' h/dia · horas extras x' + fmtNum(run.overtime_multiplier) +
      ' · INSS ' + fmtNum(run.inss_pct) + '%' + (run.deduct_late ? ' · desconta atrasos' : '')) + '</p></div><button class="btn" id="back">Voltar</button></div>' +
      (draft && checks.pending_absences > 0 ? '<div class="alert alert-error">' + checks.pending_absences + ' falta(s) pendente(s) de justificação neste mês. Resolva em Faltas e recalcule antes de fechar.</div>' : '') +
      (draft && checks.without_salary > 0 ? '<div class="alert alert-error">' + checks.without_salary + ' funcionário(s) activo(s) sem salário definido não entram nesta folha.</div>' : '') +
      '<div id="msg"></div><div class="card" style="margin-bottom:12px">' +
      '<div class="kv"><span>Funcionários</span><span>' + items.length + '</span></div>' +
      '<div class="kv"><span>Vencimento bruto</span><span>' + esc(fmtMoney(sum('gross'))) + '</span></div>' +
      '<div class="kv"><span>Descontos de faltas e atrasos</span><span>' + esc(fmtMoney(sum('absence_deduction') + sum('late_deduction'))) + '</span></div>' +
      '<div class="kv"><span>INSS</span><span>' + esc(fmtMoney(sum('inss'))) + '</span></div>' +
      '<div class="kv"><span>Adiantamentos e outros descontos</span><span>' + esc(fmtMoney(sum('advances') + sum('other_deductions'))) + '</span></div>' +
      '<div class="kv" style="border:0"><span><b>Líquido a pagar</b></span><span><b>' + esc(fmtMoney(sum('net'))) + '</b></span></div>' +
      (draft ? '' : '<div class="kv" style="border:0"><span>Pagos</span><span>' + paidN + ' / ' + items.length + '</span></div>') + '</div>' +
      '<div class="btn-row" style="margin:0 0 12px">' +
      (draft ? '<button class="btn" id="b-recalc">Recalcular</button><button class="btn btn-primary" id="b-close">Fechar folha</button><button class="btn btn-danger" id="b-del">Eliminar rascunho</button>'
        : '<button class="btn btn-primary" id="b-paid">Marcar todos como pagos</button>') +
      '<button class="btn" id="b-csv">Mapa (CSV)</button><button class="btn" id="b-copy">Copiar mapa</button><button class="btn" id="b-print">' + (isAppWebView() ? 'Mapa (HTML)' : 'Mapa (imprimir)') + '</button></div>' +
      '<div id="rows">' + (items.length ? items.map((x, i) => '<button class="item" data-i="' + i + '"><div class="t"><span>' + esc(emp(x).full_name || '') + '</span>' +
        (x.paid_at ? badge('Pago', 'ok') : '') + '</div><div class="s">' + esc(emp(x).code || '') + ' · ' + esc(PAY_LABEL[x.pay_type] || '') + ' · presenças ' + x.days_present +
        ' · faltas ' + (x.days_abs_just + x.days_abs_unjust + x.days_abs_pending) + ' · líquido <b>' + esc(fmtMoney(x.net)) + '</b></div></button>').join('')
        : '<div class="empty">Nenhum funcionário com salário definido. Defina os salários em Salários e recalcule.</div>') + '</div>';

    const msg = (t, ok) => { const b = $('#msg'); b.className = 'alert ' + (ok ? 'alert-ok' : 'alert-error'); b.textContent = t; };
    $('#back').addEventListener('click', showList);
    $('#rows').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) openItem(items[Number(b.dataset.i)]); });

    // ----- mapa de salários -----
    const head = ['Código', 'Funcionário', 'Cargo', 'Tipo', 'Dias presentes', 'Horas extras', 'Vencimento base', 'Pagamento horas extras', 'Bónus',
      'Descontos faltas/atrasos', 'INSS', 'Adiantamentos', 'Outros descontos', 'Líquido', 'Pago'];
    const rowsNum = items.map(x => [emp(x).code || '', emp(x).full_name || '', emp(x).position || '', PAY_LABEL[x.pay_type], x.days_present, num(x.overtime_hours),
      num(x.base_pay), num(x.overtime_pay), num(x.bonus), num(x.absence_deduction) + num(x.late_deduction), num(x.inss), num(x.advances), num(x.other_deductions), num(x.net), x.paid_at ? 'Sim' : 'Não']);
    const totals = ['', 'TOTAL', '', '', sum('days_present'), sum('overtime_hours'), sum('base_pay'), sum('overtime_pay'), sum('bonus'),
      sum('absence_deduction') + sum('late_deduction'), sum('inss'), sum('advances'), sum('other_deductions'), sum('net'), ''];
    const fileBase = 'donac_folha_' + String(run.period).slice(0, 7);
    $('#b-csv').addEventListener('click', () => downloadCSV(fileBase + '.csv', head, rowsNum.concat([totals])));
    $('#b-copy').addEventListener('click', () => copyTable(head, rowsNum.concat([totals])));
    $('#b-print').addEventListener('click', () => {
      const money = [6, 7, 8, 9, 10, 11, 12, 13];
      const fmtRow = r => r.map((c, i) => money.includes(i) && typeof c === 'number' ? fmtMoney(c, true) : c);
      openDoc(fileBase + '.html', reportHtml('DONAC · Mapa de salários · ' + monthName(run.period), obraName + ' · Emitido em ' + fmtDate(todayISO()) + ' por ' + ctx.full_name + ' · valores em MT',
        head, rowsNum.map(fmtRow).concat([fmtRow(totals)])));
    });

    if (draft) {
      $('#b-recalc').addEventListener('click', async () => {
        const { error } = await db.rpc('payroll_recalculate', { p_run: id });
        if (error) return msg(errMsg(error)); toast('Folha recalculada.'); showRun(id);
      });
      $('#b-close').addEventListener('click', async () => {
        if (!confirm('Fechar a folha de ' + monthName(run.period) + '? Depois de fechada não pode ser alterada.')) return;
        const { error } = await db.rpc('payroll_close', { p_run: id });
        if (error) return msg(errMsg(error)); toast('Folha fechada.'); showRun(id);
      });
      $('#b-del').addEventListener('click', async () => {
        if (!confirm('Eliminar este rascunho?')) return;
        const { error } = await db.rpc('payroll_delete_run', { p_run: id });
        if (error) return msg(errMsg(error)); toast('Rascunho eliminado.'); showList();
      });
    } else {
      $('#b-paid').addEventListener('click', async () => {
        if (!confirm('Marcar todos os funcionários como pagos?')) return;
        const { error } = await db.rpc('payroll_mark_paid', { p_run: id, p_items: null, p_paid: true });
        if (error) return msg(errMsg(error)); toast('Pagamentos registados.'); showRun(id);
      });
    }

    // ----- detalhe / ajustes / recibo de um funcionário -----
    function openItem(x) {
      const e = emp(x);
      const kv = (l, v, neg) => '<div class="kv"><span>' + l + '</span><span>' + (neg && num(v) ? '−' : '') + esc(fmtMoney(v)) + '</span></div>';
      const m = openModal(e.full_name || '',
        '<div class="kv"><span>Cargo</span><span>' + esc(e.position || '') + '</span></div>' +
        '<div class="kv"><span>Salário</span><span>' + esc(PAY_LABEL[x.pay_type] + ' · ' + fmtMoney(x.rate)) + '</span></div>' +
        '<div class="kv"><span>Presenças / férias e licença</span><span>' + x.days_present + ' / ' + x.days_leave + '</span></div>' +
        '<div class="kv"><span>Faltas (just. / injust. / pend.)</span><span>' + x.days_abs_just + ' / ' + x.days_abs_unjust + ' / ' + x.days_abs_pending + '</span></div>' +
        '<div class="kv"><span>Horas extras / minutos de atraso</span><span>' + esc(fmtNum(x.overtime_hours)) + ' / ' + x.late_minutes + '</span></div>' +
        kv('Vencimento base', x.base_pay) + kv('Horas extras', x.overtime_pay) + kv('Bónus', x.bonus) +
        kv('Desconto por faltas', x.absence_deduction, true) + kv('Desconto por atrasos', x.late_deduction, true) +
        kv('Bruto', x.gross) + kv('INSS', x.inss, true) + kv('Adiantamentos', x.advances, true) + kv('Outros descontos', x.other_deductions, true) +
        '<div class="kv" style="border:0"><span><b>Líquido</b></span><span><b>' + esc(fmtMoney(x.net)) + '</b></span></div>' +
        (x.adj_notes ? '<div class="s" style="color:var(--muted);font-size:13px">' + esc(x.adj_notes) + '</div>' : '') +
        '<div id="i-msg" style="margin-top:10px"></div>' +
        (draft
          ? '<div class="section-title">Ajustes manuais</div>' +
            '<div class="field"><label for="a-bonus">Bónus (MT)</label><input id="a-bonus" inputmode="decimal" value="' + esc(String(num(x.bonus)).replace('.', ',')) + '"></div>' +
            '<div class="field"><label for="a-adv">Adiantamentos (MT)</label><input id="a-adv" inputmode="decimal" value="' + esc(String(num(x.advances)).replace('.', ',')) + '"></div>' +
            '<div class="field"><label for="a-oth">Outros descontos, ex.: IRPS (MT)</label><input id="a-oth" inputmode="decimal" value="' + esc(String(num(x.other_deductions)).replace('.', ',')) + '"></div>' +
            '<div class="field"><label for="a-obs">Observação</label><input id="a-obs" value="' + esc(x.adj_notes || '') + '"></div>' +
            '<button class="btn btn-primary btn-block" id="a-save">Guardar ajustes</button>'
          : '<div class="btn-row"><button class="btn btn-primary" id="i-slip">' + (isAppWebView() ? 'Recibo (HTML)' : 'Recibo (imprimir)') + '</button>' +
            '<button class="btn" id="i-paid">' + (x.paid_at ? 'Desmarcar pagamento' : 'Marcar como pago') + '</button></div>'));
      const im = (t, ok) => { const b = $('#i-msg', m.el); b.className = 'alert ' + (ok ? 'alert-ok' : 'alert-error'); b.textContent = t; };
      if (draft) {
        $('#a-save', m.el).addEventListener('click', async () => {
          const b = parseQty($('#a-bonus', m.el).value || '0'), a = parseQty($('#a-adv', m.el).value || '0'), o = parseQty($('#a-oth', m.el).value || '0');
          if (!(b >= 0) || !(a >= 0) || !(o >= 0)) return im('Os valores têm de ser números iguais ou maiores que zero.');
          const { error } = await db.rpc('payroll_adjust', { p_item: x.id, p_bonus: b, p_advances: a, p_other: o, p_notes: $('#a-obs', m.el).value.trim() || null });
          if (error) return im(errMsg(error));
          m.close(); toast('Ajustes guardados.'); showRun(id);
        });
      } else {
        $('#i-slip', m.el).addEventListener('click', () => openDoc('recibo_' + (e.code || 'func') + '_' + String(run.period).slice(0, 7) + '.html', payslipHtml(run, x)));
        $('#i-paid', m.el).addEventListener('click', async () => {
          const { error } = await db.rpc('payroll_mark_paid', { p_run: id, p_items: [x.id], p_paid: !x.paid_at });
          if (error) return im(errMsg(error));
          m.close(); showRun(id);
        });
      }
    }
  }

  function payslipHtml(run, x) {
    const e = first(x.employees) || {};
    const L = (l, v, neg) => '<tr><td>' + esc(l) + '</td><td class="r">' + (neg && num(v) ? '−' : '') + esc(fmtMoney(v, true)) + '</td></tr>';
    return '<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recibo de vencimento</title>' +
      '<style>body{font-family:Arial,sans-serif;margin:18px;color:#111;max-width:680px}h1{font-size:19px;margin:0;color:#0b2a4a}h2{font-size:14px;margin:16px 0 6px;color:#0b2a4a}' +
      'p{margin:2px 0;font-size:13px}table{border-collapse:collapse;width:100%;font-size:13px}td{border-bottom:1px solid #ddd;padding:5px 4px}.r{text-align:right;white-space:nowrap}' +
      '.net td{font-weight:700;font-size:15px;border-top:2px solid #0b2a4a}.sig{display:flex;gap:30px;margin-top:46px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px;text-align:center}' +
      'button{margin-bottom:12px;padding:10px 16px;font-size:15px}@media print{button{display:none}}</style></head><body>' +
      '<button onclick="window.print()">Imprimir / Guardar como PDF</button><h1>Recibo de vencimento</h1><p><b>' + esc(obraName) + '</b></p><p>Mês de referência: <b>' + esc(monthName(run.period)) + '</b></p>' +
      '<h2>Funcionário</h2><p>' + esc(e.full_name || '') + ' (' + esc(e.code || '') + ')</p><p>Cargo: ' + esc(e.position || '') + '</p>' +
      '<p>Salário: ' + esc(PAY_LABEL[x.pay_type] + ' · ' + fmtMoney(x.rate)) + '</p>' +
      '<p>Presenças: ' + x.days_present + ' · Faltas: ' + (x.days_abs_just + x.days_abs_unjust + x.days_abs_pending) + ' · Horas extras: ' + esc(fmtNum(x.overtime_hours)) + ' · Atrasos: ' + x.late_minutes + ' min</p>' +
      '<h2>Abonos</h2><table>' + L('Vencimento base', x.base_pay) + L('Horas extras', x.overtime_pay) + L('Bónus', x.bonus) + '</table>' +
      '<h2>Descontos</h2><table>' + L('Faltas', x.absence_deduction, true) + L('Atrasos', x.late_deduction, true) + L('INSS', x.inss, true) +
      L('Adiantamentos', x.advances, true) + L('Outros descontos', x.other_deductions, true) + '</table>' +
      '<table style="margin-top:10px"><tr class="net"><td>Líquido a receber (MT)</td><td class="r">' + esc(fmtMoney(x.net, true)) + '</td></tr></table>' +
      (x.adj_notes ? '<p style="margin-top:8px">Nota: ' + esc(x.adj_notes) + '</p>' : '') +
      '<div class="sig"><div>O empregador</div><div>O funcionário</div></div><p style="margin-top:14px;font-size:11px;color:#666">Emitido em ' + esc(fmtDate(todayISO())) + '</p></body></html>';
  }

  await showList();
});
