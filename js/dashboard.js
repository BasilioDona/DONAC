// Dashboard da obra: uma única chamada ao abrir ou ao carregar em "Actualizar".
// O servidor só devolve os módulos que o utilizador pode ver.
(async function () {
  try {
    const ctx = await guard('obra');
    if (!ctx) return;
    const m = ctx.membership;
    const content = renderShell({ ctxLabel: m.obra_name, menu: buildMenu(ctx), active: 'dashboard' });
    const canW = can(ctx, 'warehouse') || can(ctx, 'inventory') || can(ctx, 'reports');
    const canS = can(ctx, 'staff') || can(ctx, 'reports');
    content.innerHTML =
      '<div class="row"><div><h1>' + esc(m.obra_name) + '</h1><p class="sub" style="margin:0">' + esc(ctx.full_name) + ' · ' +
      esc(ROLE_LABELS[m.role] || m.role) + '</p></div>' + ((canW || canS) ? '<button class="btn" id="btn-refresh">Actualizar</button>' : '') + '</div>' +
      '<div id="dash" class="loading">A carregar...</div>';
    if (!canW && !canS) {
      $('#dash').className = '';
      $('#dash').innerHTML = '<div class="alert alert-error">Ainda não tem módulos atribuídos. Contacte o administrador.</div>';
      return;
    }
    $('#btn-refresh').addEventListener('click', load);

    const card = (n, label, cls, href) => (href ? '<a class="card stat ' : '<div class="card stat ') + (cls || '') + '"' + (href ? ' href="' + href + '"' : '') + '>' +
      '<div class="n" data-count="' + esc(n) + '">' + esc(n) + '</div><div class="l">' + esc(label) + '</div>' + (href ? '</a>' : '</div>');
    const moves = (list, sign) => list.length ? list.map(x => '<div class="kv"><span>' + esc(x.name) + '</span><span>' + sign +
      esc(fmtNum(x.quantity) + ' ' + x.unit) + ' · ' + esc(fmtDate(x.movement_date)) + '</span></div>').join('')
      : '<div class="s" style="color:var(--muted)">Sem registos.</div>';

    async function load() {
      const box = $('#dash');
      try {
        const { data, error } = await db.rpc('obra_dashboard', { p_obra: m.obra_id, p_today: todayISO() });
        if (error) throw error;
        let h = '';
        if (data.warehouse) {
          const w = data.warehouse;
          h += '<div class="section-title">Armazém</div><div class="grid">' +
            card(w.materials, 'Materiais cadastrados', '', can(ctx, 'warehouse') ? 'materiais.html' : '') +
            card(w.low, 'Stock baixo', w.low > 0 ? 'warn' : '', can(ctx, 'warehouse') || can(ctx, 'inventory') ? 'alertas.html' : '') +
            card(w.out, 'Esgotados', w.out > 0 ? 'bad' : '', can(ctx, 'warehouse') || can(ctx, 'inventory') ? 'alertas.html' : '') +
            card(w.open_inventories, 'Inventários pendentes', w.open_inventories > 0 ? 'warn' : '', can(ctx, 'inventory') ? 'inventario.html' : '') +
            '</div><div class="section-title">Últimas entradas</div><div class="card">' + moves(w.last_entries, '+') + '</div>' +
            '<div class="section-title">Últimas saídas</div><div class="card">' + moves(w.last_exits, '−') + '</div>';
        }
        if (data.staff) {
          const s = data.staff;
          h += '<div class="section-title">Funcionários</div><div class="grid">' +
            card(s.employees, 'Total de funcionários', '', can(ctx, 'staff') ? 'funcionarios.html' : '') +
            card(s.present, 'Presentes hoje', 'ok', can(ctx, 'staff') ? 'presencas.html' : '') +
            card(s.absent, 'Ausentes hoje', s.absent > 0 ? 'bad' : '', can(ctx, 'staff') ? 'faltas.html' : '') +
            card(s.pending_absences, 'Faltas por justificar', s.pending_absences > 0 ? 'warn' : '', can(ctx, 'staff') ? 'faltas.html' : '') +
            card(s.late_today, 'Atrasos hoje', '', '') + '</div>';
        }
        box.className = ''; box.innerHTML = h; runCountUps(box);
      } catch (e) {
        box.className = ''; box.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
      }
    }
    await load();
  } catch (e) { showFatal(e); }
})();
