bootObraPage('entradas', ['warehouse'], async (ctx, content, obraId) => {
  content.innerHTML =
    '<h1>Entradas de material</h1><p class="sub">Registo de recepção no armazém</p>' +
    '<div class="card"><div id="msg"></div><div id="pick"></div>' +
    '<div class="field"><label for="e-qty">Quantidade</label><input id="e-qty" inputmode="decimal"></div>' +
    '<div class="field"><label for="e-date">Data</label><input id="e-date" type="date"></div>' +
    '<div class="field"><label for="e-by">Responsável pela recepção</label><input id="e-by"></div>' +
    '<div class="field"><label for="e-sup">Fornecedor (opcional)</label><input id="e-sup"></div>' +
    '<div class="field"><label for="e-doc">Nº da fatura ou guia (opcional)</label><input id="e-doc"></div>' +
    '<div class="field"><label for="e-obs">Observação (opcional)</label><textarea id="e-obs"></textarea></div>' +
    '<button class="btn btn-primary btn-block" id="e-save">Confirmar entrada</button></div>' +
    '<div class="section-title">Últimas entradas</div><div id="recent" class="loading">A carregar...</div>';

  const picker = materialPicker($('#pick'), obraId);
  $('#e-date').value = todayISO();
  $('#e-by').value = ctx.full_name;
  const recent = $('#recent');
  bindMovementClicks(recent);

  $('#e-save').addEventListener('click', async () => {
    const msg = $('#msg'), btn = $('#e-save');
    const fail = t => { msg.className = 'alert alert-error'; msg.textContent = t; window.scrollTo(0, 0); };
    const mat = picker.get(), qty = parseQty($('#e-qty').value), by = $('#e-by').value.trim();
    if (!mat) return fail('Seleccione o material.');
    if (!(qty > 0)) return fail('Indique uma quantidade maior que zero.');
    if (!by) return fail('Indique o responsável pela recepção.');
    btn.disabled = true; btn.textContent = 'A registar...';
    const { error } = await db.rpc('register_entry', {
      p_obra: obraId, p_material: mat.id, p_qty: qty, p_date: $('#e-date').value || todayISO(),
      p_received_by: by, p_supplier: $('#e-sup').value.trim() || null,
      p_doc: $('#e-doc').value.trim() || null, p_notes: $('#e-obs').value.trim() || null });
    btn.disabled = false; btn.textContent = 'Confirmar entrada';
    if (error) return fail(errMsg(error));
    msg.className = 'alert alert-ok';
    msg.textContent = 'Entrada registada: +' + fmtNum(qty) + ' ' + mat.unit + ' de ' + mat.name + '.';
    picker.reset();
    ['e-qty', 'e-sup', 'e-doc', 'e-obs'].forEach(id => { $('#' + id).value = ''; });
    recentMovements(obraId, 'entrada', recent);
  });

  await recentMovements(obraId, 'entrada', recent);
});
