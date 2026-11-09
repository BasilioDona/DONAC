bootObraPage('alertas', ['warehouse', 'inventory'], async (ctx, content, obraId) => {
  content.innerHTML =
    '<div class="row"><div><h1>Alertas de armazém</h1><p class="sub" style="margin:0">Calculados ao abrir ou actualizar</p></div>' +
    '<button class="btn" id="btn-refresh">Actualizar</button></div><div id="out" class="loading">A carregar...</div>';
  $('#btn-refresh').addEventListener('click', load);

  const sug = (r, unit) => 'Consumo médio: ' + fmtNum(r.daily) + ' ' + unit + '/dia · sugestão de reposição: <b>' + fmtNum(r.suggested) + ' ' + esc(unit) + '</b>';
  const SECTIONS = [
    ['out', 'Esgotados', 'bad', r => sug(r, r.unit)],
    ['low', 'Stock abaixo do mínimo', 'warn', r => 'Stock ' + fmtNum(r.stock) + ' ' + esc(r.unit) + ' (mínimo ' + fmtNum(r.min_stock) + ')<br>' + sug(r, r.unit)],
    ['high', 'Consumo elevado nos últimos 7 dias', 'warn', r => 'Saídas em 7 dias: ' + fmtNum(r.s7) + ' ' + esc(r.unit) + ' · em 30 dias: ' + fmtNum(r.s30) + ' · stock ' + fmtNum(r.stock)],
    ['nomove', 'Sem movimentação há 60 dias', 'muted', r => 'Stock parado: ' + fmtNum(r.stock) + ' ' + esc(r.unit)],
  ];

  async function load() {
    const out = $('#out');
    try {
      const { data, error } = await db.rpc('warehouse_alerts', { p_obra: obraId, p_today: todayISO() });
      if (error) throw error;
      let h = '', total = 0;
      for (const [key, title, cls, fn] of SECTIONS) {
        const list = data[key] || [];
        if (!list.length) continue;
        total += list.length;
        h += '<div class="section-title">' + esc(title) + ' ' + badge(list.length, cls) + '</div>' +
          list.map(r => '<div class="card" style="margin-bottom:10px"><div style="font-weight:600">' + esc(r.code + ' · ' + r.name) +
            '</div><div class="s" style="color:var(--muted);font-size:13px;margin-top:3px">' + fn(r) + '</div></div>').join('');
      }
      if ((data.pending || []).length) {
        total += data.pending.length;
        h += '<div class="section-title">Inventários pendentes ' + badge(data.pending.length, 'warn') + '</div>' +
          data.pending.map(p => '<a class="card" style="margin-bottom:10px" href="inventario.html"><div style="font-weight:600">Inventário aberto desde ' +
            esc(fmtDate(p.started_at)) + '</div>' + (p.notes ? '<div class="s" style="color:var(--muted);font-size:13px">' + esc(p.notes) + '</div>' : '') + '</a>').join('');
      }
      out.className = '';
      out.innerHTML = (total ? h : '<div class="alert alert-ok">Sem alertas neste momento.</div>') +
        '<p class="hint">As sugestões usam o histórico de saídas dos últimos 30 dias. O sistema nunca gera compras automaticamente.</p>';
    } catch (e) {
      out.className = ''; out.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }
  await load();
});
