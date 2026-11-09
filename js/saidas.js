bootObraPage('saidas', ['warehouse'], async (ctx, content, obraId) => {
  content.innerHTML =
    '<h1>Saídas de material</h1><p class="sub">Registo de material entregue pelo armazém</p>' +
    '<div class="card"><div id="msg"></div><div id="pick"></div>' +
    '<div class="field"><label for="s-qty">Quantidade</label><input id="s-qty" inputmode="decimal"></div>' +
    '<div class="field"><label for="s-date">Data</label><input id="s-date" type="date"></div>' +
    '<div class="field"><label for="s-req">Quem solicitou</label><input id="s-req"></div>' +
    '<div class="field"><label for="s-rec">Quem recebeu</label><input id="s-rec"></div>' +
    '<div class="field"><label for="s-aut">Responsável pela autorização</label><input id="s-aut"></div>' +
    '<div class="field"><label for="s-pur">Finalidade</label><input id="s-pur"></div>' +
    '<div class="field"><label for="s-obs">Observação (opcional)</label><textarea id="s-obs"></textarea></div>' +
    '<button class="btn btn-primary btn-block" id="s-save">Confirmar saída</button></div>' +
    '<div class="section-title">Últimas saídas</div><div id="recent" class="loading">A carregar...</div>';

  const picker = materialPicker($('#pick'), obraId);
  $('#s-date').value = todayISO();
  $('#s-aut').value = ctx.full_name;
  const recent = $('#recent');
  bindMovementClicks(recent);

  $('#s-save').addEventListener('click', async () => {
    const msg = $('#msg'), btn = $('#s-save');
    const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; window.scrollTo(0, 0); };
    const mat = picker.get(), qty = parseQty($('#s-qty').value);
    const req = $('#s-req').value.trim(), rec = $('#s-rec').value.trim();
    const aut = $('#s-aut').value.trim(), pur = $('#s-pur').value.trim();
    if (!mat) return fail('Seleccione o material.');
    if (!(qty > 0)) return fail('Indique uma quantidade maior que zero.');
    if (qty > Number(mat.stock)) return fail('Stock insuficiente. Disponível: ' + fmtNum(mat.stock) + ' ' + mat.unit + '.');
    if (!req || !rec || !aut || !pur) return fail('Preencha solicitante, recebedor, autorização e finalidade.');
    btn.disabled = true; btn.textContent = 'A registar...';
    const { error } = await db.rpc('register_exit', {
      p_obra: obraId, p_material: mat.id, p_qty: qty, p_date: $('#s-date').value || todayISO(),
      p_requested_by: req, p_delivered_to: rec, p_authorized_by: aut, p_purpose: pur,
      p_notes: $('#s-obs').value.trim() || null });
    btn.disabled = false; btn.textContent = 'Confirmar saída';
    if (error) return fail(errMsg(error));
    msg.className = 'alert alert-ok';
    msg.textContent = 'Saída registada: −' + fmtNum(qty) + ' ' + mat.unit + ' de ' + mat.name +
      '. Stock restante: ' + fmtNum(Number(mat.stock) - qty) + '.';
    picker.reset();
    ['s-qty', 's-req', 's-rec', 's-pur', 's-obs'].forEach(id => { $('#' + id).value = ''; });
    recentMovements(obraId, 'saida', recent);
  });

  await recentMovements(obraId, 'saida', recent);
});
