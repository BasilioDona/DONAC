// Ajudantes partilhados do módulo de armazém.
const TYPE_LABEL = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' };
const TYPE_CLS = { entrada: 'ok', saida: 'bad', ajuste: 'warn' };
const MOV_COLS = 'id,type,quantity,stock_before,stock_after,movement_date,supplier,document_no,received_by,' +
  'requested_by,delivered_to,authorized_by,purpose,notes,created_at,materials(code,name,unit)';

function stockBadge(m) {
  const s = Number(m.stock), mn = Number(m.min_stock);
  if (s <= 0) return badge('Esgotado', 'bad');
  if (mn > 0 && s <= mn) return badge('Stock baixo', 'warn');
  return '';
}

let _cats = null;
async function getCategories(obraId, force) {
  if (_cats && !force) return _cats;
  const { data, error } = await db.from('material_categories')
    .select('id,name').eq('obra_id', obraId).order('name').limit(200);
  if (error) throw error;
  _cats = data;
  return data;
}

// Seletor de material por pesquisa (evita carregar a lista inteira)
function materialPicker(root, obraId) {
  let selected = null, timer = null, reqId = 0;
  root.innerHTML = '<div class="field" id="mp-field"><label for="mp-q">Material</label>' +
    '<input id="mp-q" placeholder="Pesquisar por nome ou código" autocomplete="off"></div>' +
    '<div id="mp-res"></div><div id="mp-sel"></div>';
  const q = $('#mp-q', root), res = $('#mp-res', root), sel = $('#mp-sel', root), field = $('#mp-field', root);

  function showSelected() {
    if (!selected) { sel.innerHTML = ''; field.style.display = ''; return; }
    field.style.display = 'none'; res.innerHTML = '';
    sel.innerHTML = '<div class="card" style="margin-bottom:14px"><div class="t" style="font-weight:600">' +
      esc(selected.code + ' · ' + selected.name) + '</div>' +
      '<div class="s" style="color:var(--muted);font-size:13px;margin:3px 0 8px">Stock actual: ' +
      esc(fmtNum(selected.stock) + ' ' + selected.unit) + '</div>' +
      '<button class="btn" id="mp-change" type="button" style="min-height:38px">Alterar material</button></div>';
    $('#mp-change', root).addEventListener('click', () => { selected = null; q.value = ''; showSelected(); q.focus(); });
  }

  async function search() {
    const s = q.value.replace(/[,()%*\\]/g, ' ').trim();
    if (s.length < 2) { res.innerHTML = ''; return; }
    const my = ++reqId;
    res.innerHTML = '<div class="loading" style="padding:8px">A pesquisar...</div>';
    const { data, error } = await db.from('materials').select('id,code,name,unit,stock,min_stock')
      .eq('obra_id', obraId).eq('active', true)
      .or('name.ilike.%' + s + '%,code.ilike.%' + s + '%').order('name').limit(8);
    if (my !== reqId) return;
    if (error) { res.innerHTML = '<div class="alert alert-error">' + esc(errMsg(error)) + '</div>'; return; }
    res.innerHTML = data.length ? data.map((m, i) =>
      '<button class="item" type="button" data-i="' + i + '"><div class="t"><span>' + esc(m.code + ' · ' + m.name) +
      '</span></div><div class="s">Stock: ' + esc(fmtNum(m.stock) + ' ' + m.unit) + '</div></button>').join('')
      : '<div class="empty" style="padding:10px">Nenhum material encontrado.</div>';
    res._data = data;
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (b && res._data) { selected = res._data[Number(b.dataset.i)]; showSelected(); }
  });
  return {
    get: () => selected,
    reset: () => { selected = null; q.value = ''; res.innerHTML = ''; showSelected(); }
  };
}

function movementItem(r) {
  const m = Array.isArray(r.materials) ? r.materials[0] : r.materials;
  const neg = r.type === 'saida' || (r.type === 'ajuste' && Number(r.quantity) < 0);
  return '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(m ? m.name : '') + '</span>' +
    badge(TYPE_LABEL[r.type] || r.type, TYPE_CLS[r.type]) + '</div><div class="s">' + esc(fmtDate(r.movement_date)) +
    ' · ' + (neg ? '−' : '+') + esc(fmtNum(Math.abs(r.quantity)) + ' ' + (m ? m.unit : '')) +
    ' · stock ' + esc(fmtNum(r.stock_before)) + ' → ' + esc(fmtNum(r.stock_after)) + '</div></button>';
}

function movementDetail(r) {
  const m = Array.isArray(r.materials) ? r.materials[0] : r.materials;
  const kv = (l, v) => v ? '<div class="kv"><span>' + l + '</span><span>' + esc(v) + '</span></div>' : '';
  const neg = r.type === 'saida' || (r.type === 'ajuste' && Number(r.quantity) < 0);
  openModal((TYPE_LABEL[r.type] || r.type) + ' · ' + (m ? m.code : ''),
    kv('Material', m ? m.name : '') + kv('Data', fmtDate(r.movement_date)) +
    kv('Quantidade', (neg ? '−' : '+') + fmtNum(Math.abs(r.quantity)) + ' ' + (m ? m.unit : '')) +
    kv('Stock anterior', fmtNum(r.stock_before)) + kv('Stock posterior', fmtNum(r.stock_after)) +
    kv('Fornecedor', r.supplier) + kv('Fatura / guia', r.document_no) + kv('Recebido por', r.received_by) +
    kv('Solicitante', r.requested_by) + kv('Entregue a', r.delivered_to) + kv('Autorizado por', r.authorized_by) +
    kv('Finalidade', r.purpose) + kv('Observação', r.notes));
}

async function recentMovements(obraId, type, box) {
  try {
    const { data, error } = await db.from('stock_movements').select(MOV_COLS)
      .eq('obra_id', obraId).eq('type', type).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    box.className = '';
    box.innerHTML = data.length ? data.map(movementItem).join('') : '<div class="empty">Sem registos.</div>';
    box._rows = data;
  } catch (e) {
    box.className = '';
    box.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>';
  }
}
function bindMovementClicks(box) {
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b || !box._rows) return;
    const r = box._rows.find(x => x.id === b.dataset.id);
    if (r) movementDetail(r);
  });
}
