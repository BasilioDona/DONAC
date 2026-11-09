const SESSION_LABEL = { aberto: 'Em curso', confirmado: 'Confirmado', cancelado: 'Cancelado' };
const SESSION_CLS = { aberto: 'warn', confirmado: 'ok', cancelado: 'muted' };

bootObraPage('inventario', ['inventory'], async (ctx, content, obraId) => {

  // ---------- lista de inventários ----------
  async function showList() {
    content.innerHTML = '<h1>Inventário físico</h1><p class="sub">Contagem, comparação e ajustes auditados</p><div id="box" class="loading">A carregar...</div>';
    try {
      const { data, error } = await db.from('inventory_sessions')
        .select('id,status,notes,started_at,confirmed_at').eq('obra_id', obraId)
        .order('started_at', { ascending: false }).limit(11);
      if (error) throw error;
      const open = data.find(s => s.status === 'aberto');
      const hist = data.filter(s => s.status !== 'aberto').slice(0, 10);
      const box = $('#box'); box.className = '';
      box.innerHTML =
        (open
          ? '<div class="card"><div class="t" style="font-weight:600">Inventário em curso ' + badge('Em curso', 'warn') + '</div>' +
            '<div class="s" style="color:var(--muted);font-size:13px;margin:4px 0 10px">Iniciado em ' + esc(fmtDate(open.started_at)) + '</div>' +
            '<button class="btn btn-primary btn-block" data-open="' + esc(open.id) + '">Continuar contagem</button></div>'
          : '<button class="btn btn-primary btn-block" id="btn-start">Iniciar novo inventário</button>') +
        '<div class="section-title">Histórico</div>' +
        (hist.length ? hist.map(s => '<button class="item" data-open="' + esc(s.id) + '"><div class="t"><span>' +
          esc(fmtDate(s.started_at)) + '</span>' + badge(SESSION_LABEL[s.status], SESSION_CLS[s.status]) + '</div>' +
          (s.notes ? '<div class="s">' + esc(s.notes) + '</div>' : '') + '</button>').join('')
          : '<div class="empty">Ainda sem inventários concluídos.</div>');
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-open]');
        if (b) showSession(b.dataset.open);
      });
      const bs = $('#btn-start');
      if (bs) bs.addEventListener('click', openStart);
    } catch (e) {
      $('#box').className = ''; $('#box').innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
    }
  }

  async function openStart() {
    let cats = [];
    try { cats = await getCategories(obraId); } catch (e) { /* segue sem filtro */ }
    const m = openModal('Iniciar inventário',
      '<div id="s-msg"></div>' +
      '<p class="sub">Os artigos activos ficam registados com o stock actual do sistema. Só pode haver um inventário aberto por obra.</p>' +
      '<div class="field"><label for="s-cat">Artigos a contar</label><select id="s-cat"><option value="">Todos os materiais activos</option>' +
      cats.map(c => '<option value="' + esc(c.id) + '">Categoria: ' + esc(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="s-notes">Observação (opcional)</label><input id="s-notes"></div>' +
      '<button class="btn btn-primary btn-block" id="s-go">Iniciar</button>');
    $('#s-go', m.el).addEventListener('click', async () => {
      const msg = $('#s-msg', m.el), btn = $('#s-go', m.el);
      btn.disabled = true;
      try {
        let ids = null;
        const cat = $('#s-cat', m.el).value;
        if (cat) {
          const r = await db.from('materials').select('id').eq('obra_id', obraId).eq('active', true).eq('category_id', cat).limit(1000);
          if (r.error) throw r.error;
          if (!r.data.length) throw new Error('Essa categoria não tem materiais activos.');
          ids = r.data.map(x => x.id);
        }
        const { data, error } = await db.rpc('start_inventory', {
          p_obra: obraId, p_notes: $('#s-notes', m.el).value.trim() || null, p_materials: ids });
        if (error) throw error;
        m.close(); showSession(data);
      } catch (e) { msg.className = 'alert alert-error'; msg.textContent = errMsg(e); btn.disabled = false; }
    });
  }

  // ---------- contagem / relatório de um inventário ----------
  async function showSession(id) {
    content.innerHTML = '<div class="loading">A carregar...</div>';
    let sess, items;
    try {
      const s = await db.from('inventory_sessions').select('id,status,notes,started_at,confirmed_at').eq('id', id).eq('obra_id', obraId).single();
      if (s.error) throw s.error;
      const i = await db.from('inventory_items')
        .select('id,system_stock,counted_stock,justification,materials(code,name,unit)')
        .eq('session_id', id).eq('obra_id', obraId).limit(1000);
      if (i.error) throw i.error;
      sess = s.data;
      items = i.data.map(r => {
        const mt = Array.isArray(r.materials) ? r.materials[0] : r.materials;
        return { id: r.id, code: mt ? mt.code : '', name: mt ? mt.name : '', unit: mt ? mt.unit : '',
          system: Number(r.system_stock), counted: r.counted_stock === null ? '' : String(r.counted_stock),
          just: r.justification || '' };
      }).sort((a, b) => a.code.localeCompare(b.code, 'pt', { numeric: true }));
    } catch (e) {
      content.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div><button class="btn" id="back">Voltar</button>';
      $('#back').addEventListener('click', showList);
      return;
    }

    const editable = sess.status === 'aberto';
    const dirty = new Set();
    const view = { q: '', onlyDiff: false, shown: 50 };
    const diffOf = it => it.counted === '' ? null : parseQty(it.counted) - it.system;

    content.innerHTML =
      '<div class="row"><div><h1>Inventário ' + badge(SESSION_LABEL[sess.status], SESSION_CLS[sess.status]) + '</h1>' +
      '<p class="sub" style="margin:0">Início: ' + esc(fmtDate(sess.started_at)) +
      (sess.confirmed_at ? ' · Confirmado: ' + esc(fmtDate(sess.confirmed_at)) : '') + '</p></div>' +
      '<button class="btn" id="back">Voltar</button></div>' +
      (sess.notes ? '<p class="sub">' + esc(sess.notes) + '</p>' : '') +
      '<div id="prog" class="card" style="margin-bottom:12px"></div><div id="msg"></div>' +
      '<div class="filters"><div class="field"><input id="i-q" placeholder="Filtrar por nome ou código" aria-label="Filtrar"></div></div>' +
      '<label class="check"><input type="checkbox" id="i-diff"> Mostrar só diferenças</label>' +
      '<div id="rows" style="margin-top:8px"></div><div id="more"></div>' +
      (editable ? '<div class="btn-row"><button class="btn" id="b-save">Guardar contagens</button>' +
        '<button class="btn btn-primary" id="b-confirm">Confirmar inventário</button>' +
        '<button class="btn btn-danger" id="b-cancel">Cancelar inventário</button></div>' : '');

    $('#back').addEventListener('click', showList);

    function progress() {
      const counted = items.filter(i => i.counted !== '').length;
      const diffs = items.filter(i => { const d = diffOf(i); return d !== null && d !== 0; }).length;
      $('#prog').innerHTML = '<div class="kv"><span>Artigos contados</span><span>' + counted + ' / ' + items.length + '</span></div>' +
        '<div class="kv" style="border:0"><span>Com diferença</span><span>' + diffs + '</span></div>';
    }

    function diffHtml(it) {
      const d = diffOf(it);
      if (d === null) return '';
      if (d === 0) return '<span style="color:var(--green)">Sem diferença</span>';
      return '<span style="color:var(--red)">Diferença: ' + (d > 0 ? '+' : '−') + esc(fmtNum(Math.abs(d)) + ' ' + it.unit) + '</span>';
    }

    function rowHtml(it) {
      const d = diffOf(it), needJ = d !== null && d !== 0;
      if (!editable) {
        return '<div class="card" style="margin-bottom:10px"><div class="t" style="font-weight:600">' + esc(it.code + ' · ' + it.name) + '</div>' +
          '<div class="kv"><span>Sistema</span><span>' + esc(fmtNum(it.system) + ' ' + it.unit) + '</span></div>' +
          '<div class="kv"><span>Contado</span><span>' + (it.counted === '' ? 'Não contado' : esc(fmtNum(parseQty(it.counted)) + ' ' + it.unit)) + '</span></div>' +
          '<div class="s" style="font-size:13px;margin-top:6px">' + diffHtml(it) + '</div>' +
          (it.just ? '<div class="s" style="color:var(--muted);font-size:13px">Justificação: ' + esc(it.just) + '</div>' : '') + '</div>';
      }
      return '<div class="card" style="margin-bottom:10px" data-id="' + esc(it.id) + '"><div class="t" style="font-weight:600">' + esc(it.code + ' · ' + it.name) + '</div>' +
        '<div class="s" style="color:var(--muted);font-size:13px;margin:2px 0 8px">Sistema: ' + esc(fmtNum(it.system) + ' ' + it.unit) + '</div>' +
        '<input data-f="c" inputmode="decimal" placeholder="Quantidade contada" value="' + esc(it.counted) +
        '" style="width:100%;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:8px;font-size:16px">' +
        '<div class="s dtxt" style="font-size:13px;margin-top:6px">' + diffHtml(it) + '</div>' +
        '<input data-f="j" placeholder="Justificação da diferença" value="' + esc(it.just) + '" style="display:' + (needJ ? 'block' : 'none') +
        ';width:100%;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:8px;font-size:16px;margin-top:8px"></div>';
    }

    function visible() {
      const q = view.q.toLowerCase();
      return items.filter(i => (!q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) &&
        (!view.onlyDiff || (diffOf(i) !== null && diffOf(i) !== 0)));
    }
    function drawRows() {
      const v = visible();
      $('#rows').innerHTML = v.length ? v.slice(0, view.shown).map(rowHtml).join('') : '<div class="empty">Nenhum artigo.</div>';
      $('#more').innerHTML = v.length > view.shown ? '<button class="btn btn-block" id="b-more">Mostrar mais (' + (v.length - view.shown) + ')</button>' : '';
      const bm = $('#b-more');
      if (bm) bm.addEventListener('click', () => { view.shown += 50; drawRows(); });
    }

    $('#i-q').addEventListener('input', e => { view.q = e.target.value; view.shown = 50; drawRows(); });
    $('#i-diff').addEventListener('change', e => { view.onlyDiff = e.target.checked; view.shown = 50; drawRows(); });
    if (editable) {
      $('#rows').addEventListener('input', e => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        const it = items.find(x => x.id === card.dataset.id);
        if (!it) return;
        if (e.target.dataset.f === 'c') it.counted = e.target.value.trim(); else it.just = e.target.value;
        dirty.add(it.id);
        const d = diffOf(it);
        card.querySelector('.dtxt').innerHTML = diffHtml(it);
        card.querySelector('[data-f="j"]').style.display = (d !== null && d !== 0) ? 'block' : 'none';
        progress();
      });
    }

    const msg = (t, ok) => { const b = $('#msg'); b.className = 'alert ' + (ok ? 'alert-ok' : 'alert-error'); b.textContent = t; };

    async function saveCounts() {
      if (!dirty.size) return true;
      const payload = [];
      for (const it of items) {
        if (!dirty.has(it.id)) continue;
        const n = it.counted === '' ? null : parseQty(it.counted);
        if (n !== null && !(n >= 0)) { msg('Valor inválido em ' + it.code + '.'); return false; }
        payload.push({ item_id: it.id, counted: n === null ? '' : String(n), justification: it.just });
      }
      const { error } = await db.rpc('save_inventory_counts', { p_session: id, p_counts: payload });
      if (error) { msg(errMsg(error)); return false; }
      dirty.clear();
      return true;
    }

    if (editable) {
      $('#b-save').addEventListener('click', async () => {
        const b = $('#b-save'); b.disabled = true;
        if (await saveCounts()) msg('Contagens guardadas.', true);
        b.disabled = false;
      });
      $('#b-confirm').addEventListener('click', async () => {
        const missing = items.filter(i => { const d = diffOf(i); return d !== null && d !== 0 && !i.just.trim(); });
        if (missing.length) { msg('Faltam justificações em ' + missing.length + ' artigo(s) com diferença.'); return; }
        if (!items.some(i => i.counted !== '')) { msg('Conte pelo menos um artigo.'); return; }
        if (!confirm('Confirmar o inventário? Serão criados ajustes de stock para as diferenças. Esta acção não pode ser desfeita.')) return;
        const b = $('#b-confirm'); b.disabled = true;
        if (!(await saveCounts())) { b.disabled = false; return; }
        const { data, error } = await db.rpc('confirm_inventory', { p_session: id });
        if (error) { msg(errMsg(error)); b.disabled = false; return; }
        toast('Inventário confirmado. Ajustes: ' + data + '.');
        showSession(id);
      });
      $('#b-cancel').addEventListener('click', async () => {
        if (!confirm('Cancelar este inventário? As contagens são descartadas e o stock não muda.')) return;
        const { error } = await db.rpc('cancel_inventory', { p_session: id });
        if (error) { msg(errMsg(error)); return; }
        toast('Inventário cancelado.'); showList();
      });
    }

    progress();
    drawRows();
  }

  await showList();
});
