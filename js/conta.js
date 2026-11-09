// Conta própria: alterar palavra-passe (qualquer utilizador autenticado).
(async function () {
  try {
    const ctx = await guard('any');
    if (!ctx) return;
    const { data: { session } } = await db.auth.getSession();
    const label = ctx.is_super_admin ? 'Administração global' : ctx.membership.obra_name;
    const content = renderShell({ ctxLabel: label, menu: buildMenu(ctx), active: 'conta' });
    content.innerHTML =
      '<h1>A minha conta</h1><p class="sub">' + esc(ctx.full_name) + ' · ' + esc(session.user.email) + '</p>' +
      '<div class="card"><div class="section-title" style="margin-top:0">Alterar palavra-passe</div><div id="p-msg"></div>' +
      '<div class="field"><label for="p-new">Nova palavra-passe</label><input id="p-new" type="password" autocomplete="new-password"></div>' +
      '<div class="field"><label for="p-conf">Confirmar palavra-passe</label><input id="p-conf" type="password" autocomplete="new-password"></div>' +
      '<button class="btn btn-primary btn-block" id="p-save">Guardar</button></div>';
    $('#p-save').addEventListener('click', async () => {
      const msg = $('#p-msg'), btn = $('#p-save');
      const a = $('#p-new').value, b = $('#p-conf').value;
      if (a.length < 8) { msg.className = 'alert alert-error'; msg.textContent = 'Use pelo menos 8 caracteres.'; return; }
      if (a !== b) { msg.className = 'alert alert-error'; msg.textContent = 'As palavras-passe não coincidem.'; return; }
      btn.disabled = true;
      const { error } = await db.auth.updateUser({ password: a });
      btn.disabled = false;
      if (error) { msg.className = 'alert alert-error'; msg.textContent = 'Não foi possível alterar a palavra-passe.'; return; }
      msg.className = 'alert alert-ok'; msg.textContent = 'Palavra-passe alterada.';
      $('#p-new').value = ''; $('#p-conf').value = '';
    });
  } catch (e) { showFatal(e); }
})();
