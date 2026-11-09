// Ajudantes partilhados do módulo de pessoal.
const ATT_LABEL = { presente: 'Presente', falta_pendente: 'Falta pendente', falta_justificada: 'Falta justificada',
  falta_injustificada: 'Falta injustificada', ferias: 'Férias', licenca: 'Licença' };
const ATT_CLS = { presente: 'ok', falta_pendente: 'warn', falta_justificada: 'muted', falta_injustificada: 'bad', ferias: '', licenca: '' };
const FALTAS = ['falta_pendente', 'falta_justificada', 'falta_injustificada'];
const ATT_COLS = 'id,work_date,status,check_in,check_out,late_minutes,early_leave,overtime_hours,notes,employees(code,full_name)';

const empOf = r => Array.isArray(r.employees) ? r.employees[0] : r.employees;
const hhmm = t => t ? String(t).slice(0, 5) : '';

function attItem(r) {
  const e = empOf(r) || {};
  const bits = [];
  if (r.check_in || r.check_out) bits.push((hhmm(r.check_in) || '—') + '–' + (hhmm(r.check_out) || '—'));
  if (r.late_minutes > 0) bits.push('atraso ' + r.late_minutes + ' min');
  if (r.early_leave) bits.push('saída antecipada');
  if (Number(r.overtime_hours) > 0) bits.push(fmtNum(r.overtime_hours) + ' h extra');
  if (r.notes) bits.push(r.notes);
  return '<button class="item" data-id="' + esc(r.id) + '"><div class="t"><span>' + esc(e.full_name || '') + '</span>' +
    badge(ATT_LABEL[r.status] || r.status, ATT_CLS[r.status]) + '</div><div class="s">' + esc(fmtDate(r.work_date)) +
    (bits.length ? ' · ' + esc(bits.join(' · ')) : '') + '</div></button>';
}

// Seletor de funcionário por pesquisa (não carrega a lista inteira)
function employeePicker(root, obraId) {
  let selected = null, timer = null, reqId = 0;
  root.innerHTML = '<div class="field" id="ep-field"><label for="ep-q">Funcionário</label>' +
    '<input id="ep-q" placeholder="Pesquisar por nome ou código" autocomplete="off"></div>' +
    '<div id="ep-res"></div><div id="ep-sel"></div>';
  const q = $('#ep-q', root), res = $('#ep-res', root), sel = $('#ep-sel', root), field = $('#ep-field', root);

  function showSelected() {
    if (!selected) { sel.innerHTML = ''; field.style.display = ''; return; }
    field.style.display = 'none'; res.innerHTML = '';
    sel.innerHTML = '<div class="card" style="margin-bottom:14px"><div style="font-weight:600">' +
      esc(selected.code + ' · ' + selected.full_name) + '</div><div style="color:var(--muted);font-size:13px;margin:3px 0 8px">' +
      esc(selected.position || '') + '</div><button class="btn" id="ep-change" type="button" style="min-height:38px">Alterar funcionário</button></div>';
    $('#ep-change', root).addEventListener('click', () => { selected = null; q.value = ''; showSelected(); q.focus(); });
  }
  async function search() {
    const s = q.value.replace(/[,()%*\\]/g, ' ').trim();
    if (s.length < 2) { res.innerHTML = ''; return; }
    const my = ++reqId;
    res.innerHTML = '<div class="loading" style="padding:8px">A pesquisar...</div>';
    const { data, error } = await db.from('employees').select('id,code,full_name,position')
      .eq('obra_id', obraId).eq('status', 'activo')
      .or('full_name.ilike.%' + s + '%,code.ilike.%' + s + '%').order('full_name').limit(8);
    if (my !== reqId) return;
    if (error) { res.innerHTML = '<div class="alert alert-error">' + esc(errMsg(error)) + '</div>'; return; }
    res._data = data;
    res.innerHTML = data.length ? data.map((m, i) => '<button class="item" type="button" data-i="' + i + '"><div class="t"><span>' +
      esc(m.code + ' · ' + m.full_name) + '</span></div><div class="s">' + esc(m.position || '') + '</div></button>').join('')
      : '<div class="empty" style="padding:10px">Nenhum funcionário activo encontrado.</div>';
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (b && res._data) { selected = res._data[Number(b.dataset.i)]; showSelected(); }
  });
  return { get: () => selected, reset: () => { selected = null; q.value = ''; res.innerHTML = ''; showSelected(); } };
}

function monthStartISO() { return todayISO().slice(0, 8) + '01'; }
