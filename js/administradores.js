// Gestão de Super Admins (vários, todos com os mesmos poderes).
(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    const me = ctx.user_id;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'admins' });
    content.innerHTML =
      '<div class="row"><div><h1>Super Admins</h1><p class="sub" style="margin:0">Acesso total ao sistema</p></div>' +
      '<button class="btn btn-primary" id="btn-new">Novo</button></div><div id="list" class="loading">A carregar...</div>' +
      '<p class="hint">Para promover um utilizador que já existe, abra-o em Utilizadores e use "Promover a Super Admin".</p>';
    let rows = [];

    async function load() {
      const list = $('#list');
      try {
        const { data, error } = await db.from('profiles').select('id,full_name,email,active')
          .eq('is_super_admin', true).order('full_name').limit(100);
        if (error) throw error;
        rows = data; list.className = '';
        list.innerHTML = rows.map(r => '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(r.full_name) +
          (r.id === me ? ' (você)' : '') + '</span>' + badge(r.active ? 'Activo' : 'Desactivado', r.active ? 'ok' : 'bad') +
          '</div><div class="s">' + esc(r.email) + '</div></button>').join('');
      } catch (e) { list.className = ''; list.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
    }
    $('#list').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openAdmin(rows.find(x => x.id === b.dataset.id)); });
    $('#btn-new').addEventListener('click', openCreate);

    function openCreate() {
      const m = openModal('Novo Super Admin',
        '<div id="c-msg"></div><div class="field"><label for="c-name">Nome completo</label><input id="c-name" autocomplete="off"></div>' +
        '<div class="field"><label for="c-email">Email</label><input id="c-email" type="email" autocomplete="off"></div>' +
        '<div class="field"><label for="c-pw">Palavra-passe temporária</label><div class="pw-row"><input id="c-pw" autocomplete="off">' +
        '<button class="btn" id="c-gen" type="button">Gerar</button></div></div>' +
        '<button class="btn btn-primary btn-block" id="c-save">Criar Super Admin</button>');
      $('#c-gen', m.el).addEventListener('click', () => { $('#c-pw', m.el).value = randomPassword(12); });
      $('#c-save', m.el).addEventListener('click', async () => {
        const msg = $('#c-msg', m.el), btn = $('#c-save', m.el);
        const name = $('#c-name', m.el).value.trim(), email = $('#c-email', m.el).value.trim(), pw = $('#c-pw', m.el).value;
        const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; };
        if (name.length < 2 || !email) return fail('Indique nome e email.');
        if (pw.length < 8) return fail('A palavra-passe deve ter pelo menos 8 caracteres.');
        btn.disabled = true; btn.textContent = 'A criar...';
        try {
          await callAdmin({ action: 'create_super', full_name: name, email, password: pw });
          m.body.innerHTML = '<div class="alert alert-ok">Super Admin criado.</div><p>Entregue estes dados por um canal seguro. A palavra-passe não volta a ser mostrada.</p>' +
            '<div class="kv"><span>Email</span><span class="mono">' + esc(email.toLowerCase()) + '</span></div>' +
            '<div class="kv"><span>Palavra-passe</span><span class="mono">' + esc(pw) + '</span></div>' +
            '<button class="btn btn-block" style="margin-top:12px" data-close>Fechar</button>';
          load();
        } catch (e) { fail(errMsg(e)); btn.disabled = false; btn.textContent = 'Criar Super Admin'; }
      });
    }

    function openAdmin(r) {
      const self = r.id === me;
      const m = openModal(r.full_name,
        '<div class="kv"><span>Email</span><span>' + esc(r.email) + '</span></div>' +
        '<div class="kv"><span>Estado</span><span>' + badge(r.active ? 'Activo' : 'Desactivado', r.active ? 'ok' : 'bad') + '</span></div><div id="a-msg" style="margin-top:10px"></div>' +
        (self ? '<p class="sub">Esta é a sua conta. Altere a palavra-passe em Conta.</p>' :
          '<div class="section-title">Palavra-passe temporária</div><div class="pw-row"><input class="inp" id="a-pw" placeholder="Mínimo 8 caracteres" autocomplete="off">' +
          '<button class="btn" id="a-gen" type="button">Gerar</button></div><div class="btn-row"><button class="btn" id="a-setpw">Definir palavra-passe</button></div>' +
          '<div class="section-title">Conta</div><button class="btn ' + (r.active ? 'btn-danger' : 'btn-primary') + ' btn-block" id="a-tog" style="margin-bottom:8px">' +
          (r.active ? 'Desactivar' : 'Reactivar') + '</button>' +
          '<button class="btn btn-danger btn-block" id="a-demote">Remover permissão de Super Admin</button>'));
      if (self) return;
      const msg = (t, ok) => { const b = $('#a-msg', m.el); b.className = 'alert ' + (ok ? 'alert-ok' : 'alert-error'); b.innerHTML = t; };
      $('#a-gen', m.el).addEventListener('click', () => { $('#a-pw', m.el).value = randomPassword(12); });
      $('#a-setpw', m.el).addEventListener('click', async () => {
        const pw = $('#a-pw', m.el).value;
        if (pw.length < 8) return msg('A palavra-passe deve ter pelo menos 8 caracteres.');
        try { await callAdmin({ action: 'set_password', user_id: r.id, password: pw }); msg('Palavra-passe definida: <span class="mono">' + esc(pw) + '</span>. Entregue por um canal seguro.', true); }
        catch (e) { msg(esc(errMsg(e))); }
      });
      $('#a-tog', m.el).addEventListener('click', async () => {
        const to = !r.active;
        if (!confirm(to ? 'Reactivar este Super Admin?' : 'Desactivar este Super Admin? Perde o acesso de imediato.')) return;
        try { await callAdmin({ action: 'set_active', user_id: r.id, active: to }); m.close(); toast(to ? 'Reactivado.' : 'Desactivado.'); load(); }
        catch (e) { msg(esc(errMsg(e))); }
      });
      $('#a-demote', m.el).addEventListener('click', async () => {
        if (!confirm('Remover a permissão de Super Admin? A conta fica sem obra até ser atribuída a uma.')) return;
        const { error } = await db.rpc('set_super_admin', { p_user: r.id, p_value: false });
        if (error) return msg(esc(errMsg(error)));
        m.close(); toast('Permissão removida.'); load();
      });
    }
    await load();
  } catch (e) { showFatal(e); }
})();
