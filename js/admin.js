// Painel do Super Admin: indicadores numa unica chamada, so por pedido do utilizador.
(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'dashboard' });
    content.innerHTML =
      '<div class="row"><div><h1>Painel global</h1><p class="sub" style="margin:0">' + esc(ctx.full_name) + '</p></div>' +
      '<button class="btn" id="btn-refresh">Actualizar</button></div><div id="stats" class="loading">A carregar...</div>';
    $('#btn-refresh').addEventListener('click', loadStats);
    loadStats();
  } catch (e) { showFatal(e); }
})();

function statCard(n, label, cls) {
  return '<div class="card stat ' + (cls || '') + '"><div class="n">' + esc(n) + '</div><div class="l">' + esc(label) + '</div></div>';
}

async function loadStats() {
  const box = $('#stats');
  try {
    const { data, error } = await db.rpc('admin_stats');
    if (error) throw error;
    box.className = 'grid';
    box.innerHTML =
      statCard(data.obras.total, 'Obras cadastradas') +
      statCard(data.obras.ativas, 'Obras activas', 'ok') +
      statCard(data.obras.encerradas, 'Obras encerradas') +
      statCard(data.users.total, 'Utilizadores') +
      statCard(data.users.ativos, 'Utilizadores activos', 'ok') +
      statCard(data.users.desactivados, 'Utilizadores desactivados', data.users.desactivados > 0 ? 'bad' : '');
  } catch (e) {
    box.className = '';
    box.innerHTML = '<div class="alert alert-error">Não foi possível carregar os indicadores.</div>';
  }
}
