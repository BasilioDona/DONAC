// Manutenção interna (Super Admin): uso da base de dados, integridade, limpeza segura e cópia de segurança.
// Movimentações de stock e assiduidade nunca são apagadas por aqui.
const PLAN_LIMIT_MB = 500;   // limite do plano gratuito do Supabase; ajuste se o plano for outro

const TASKS = [
  { id: 'cancelled_inventories', title: 'Inventários cancelados antigos', unit: 'dias', opts: [30, 90, 180], def: 90,
    desc: 'Remove contagens que foram canceladas e nunca afectaram o stock.' },
  { id: 'unused_materials', title: 'Materiais criados por engano', unit: 'dias', opts: [30, 90, 180], def: 90,
    desc: 'Só materiais inactivos, com stock zero e sem qualquer movimentação ou inventário.' },
  { id: 'unused_employees', title: 'Funcionários sem registos', unit: 'dias', opts: [30, 90, 180], def: 90,
    desc: 'Só funcionários inactivos que nunca tiveram presenças, faltas ou férias.' },
  { id: 'audit_logs', title: 'Registos de auditoria antigos', unit: 'meses', opts: [6, 12, 24], def: 12, exportable: true,
    desc: 'Exporte primeiro. A própria limpeza fica registada na auditoria.' }
];
const BACKUP_TABLES = ['obras', 'profiles', 'obra_memberships', 'material_categories', 'materials', 'stock_movements',
  'inventory_sessions', 'inventory_items', 'employees', 'attendance', 'audit_logs'];

const fmtBytes = b => b >= 1048576 ? (b / 1048576).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' MB'
  : (b / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' KB';

(async function () {
  try {
    const ctx = await guard('super');
    if (!ctx) return;
    const content = renderShell({ ctxLabel: 'Administração global', menu: buildMenu(ctx), active: 'manutencao' });
    content.innerHTML =
      '<h1>Manutenção</h1><p class="sub">Uso da base de dados, verificações e limpeza segura. As movimentações de stock e a assiduidade nunca são apagadas aqui.</p>' +
      '<div class="row"><div class="section-title" style="margin:0">Base de dados</div><button class="btn" id="btn-usage">Actualizar</button></div>' +
      '<div id="usage" class="loading" style="margin-top:8px">A carregar...</div>' +
      '<div class="section-title">Verificação de integridade</div><div class="card"><div id="integ"><p class="sub" style="margin:0 0 10px">Confirma que o stock de cada material bate certo com o histórico de movimentações.</p></div><button class="btn" id="btn-integ">Verificar agora</button></div>' +
      '<div class="section-title">Limpeza segura</div><div id="tasks"></div>' +
      '<div class="section-title">Cópia de segurança</div><div class="card"><p class="sub" style="margin:0 0 10px">Descarrega todos os dados da aplicação num ficheiro JSON. Contém dados pessoais: guarde-o em local seguro. Não inclui as contas de acesso (Authentication).</p>' +
      '<div id="bk-msg"></div><button class="btn btn-primary" id="btn-backup">Descarregar cópia (JSON)</button></div>';

    $('#btn-usage').addEventListener('click', loadUsage);
    $('#btn-integ').addEventListener('click', checkIntegrity);
    $('#btn-backup').addEventListener('click', backup);
    renderTasks();
    $('#tasks').addEventListener('click', onTaskClick);
    await loadUsage();
  } catch (e) { showFatal(e); }
})();

async function loadUsage() {
  const box = $('#usage');
  try {
    const { data, error } = await db.rpc('db_usage');
    if (error) throw error;
    const pct = Math.min(100, data.db_bytes / (PLAN_LIMIT_MB * 1048576) * 100);
    const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? '#c98a00' : 'var(--green)';
    box.className = '';
    box.innerHTML = '<div class="card"><div class="kv" style="border:0"><span>Total usado</span><span><b>' + esc(fmtBytes(data.db_bytes)) +
      '</b> de ' + PLAN_LIMIT_MB + ' MB (' + pct.toFixed(1).replace('.', ',') + '%)</span></div>' +
      '<div style="height:10px;background:#eef1f5;border-radius:6px;overflow:hidden;margin:6px 0 12px"><div style="height:100%;width:' + pct + '%;background:' + color + '"></div></div>' +
      data.tables.map(t => '<div class="kv"><span>' + esc(t.name) + '</span><span>' + esc(fmtNum(t.rows)) + ' registos · ' + esc(fmtBytes(t.bytes)) + '</span></div>').join('') +
      '<p class="hint" style="margin-bottom:0">O total inclui o sistema do Supabase, por isso é maior que a soma das tabelas. Confirme o limite do seu plano no painel do Supabase.</p></div>';
  } catch (e) { box.className = ''; box.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
}

async function checkIntegrity() {
  const box = $('#integ'), btn = $('#btn-integ');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('check_integrity');
    if (error) throw error;
    const bad = data.stock_mismatch || [];
    box.innerHTML = '<div class="kv"><span>Materiais verificados</span><span>' + data.materials_checked + '</span></div>' +
      '<div class="kv"><span>Stock que não bate com o histórico</span><span>' + badge(bad.length, bad.length ? 'bad' : 'ok') + '</span></div>' +
      '<div class="kv"><span>Inventários abertos há mais de 30 dias</span><span>' + badge(data.stale_inventories, data.stale_inventories ? 'warn' : 'ok') + '</span></div>' +
      '<div class="kv"><span>Utilizadores activos sem obra</span><span>' + badge(data.users_without_obra, data.users_without_obra ? 'warn' : 'ok') + '</span></div>' +
      (bad.length ? '<div class="section-title">Diferenças de stock</div>' + bad.map(r => '<div class="kv"><span>' + esc(r.obra + ' · ' + r.code + ' ' + r.name) +
        '</span><span>stock ' + esc(fmtNum(r.stock)) + ' / histórico ' + esc(fmtNum(r.calc)) + '</span></div>').join('') +
        '<p class="hint">Não são corrigidas automaticamente. Corrija com um ajuste de stock justificado, para ficar registado.</p>' : '<div class="alert alert-ok" style="margin:10px 0">Tudo em ordem.</div>');
  } catch (e) { box.innerHTML = '<div class="alert alert-error">' + esc(errMsg(e)) + '</div>'; }
  btn.disabled = false;
}

function renderTasks() {
  $('#tasks').innerHTML = TASKS.map(t => '<div class="card" style="margin-bottom:12px" data-t="' + t.id + '">' +
    '<div style="font-weight:600">' + esc(t.title) + '</div><div class="s" style="color:var(--muted);font-size:13px;margin:3px 0 10px">' + esc(t.desc) + '</div>' +
    '<div class="field" style="margin-bottom:10px"><label>Mais antigos que</label><select class="inp" data-p>' +
    t.opts.map(o => '<option value="' + o + '"' + (o === t.def ? ' selected' : '') + '>' + o + ' ' + t.unit + '</option>').join('') + '</select></div>' +
    '<div class="btn-row" style="margin:0 0 8px">' + (t.exportable ? '<button class="btn" data-a="export">Exportar (CSV)</button>' : '') +
    '<button class="btn" data-a="preview">Ver o que seria eliminado</button></div><div data-r></div></div>').join('');
}

async function onTaskClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const card = b.closest('[data-t]'), task = TASKS.find(x => x.id === card.dataset.t);
  const param = Number(card.querySelector('[data-p]').value), out = card.querySelector('[data-r]');
  b.disabled = true;
  try {
    if (b.dataset.a === 'export') { await exportAudit(param); }
    else if (b.dataset.a === 'preview') {
      const { data, error } = await db.rpc('run_cleanup', { p_task: task.id, p_param: param, p_dry_run: true });
      if (error) throw error;
      out.innerHTML = data.affected > 0
        ? '<div class="alert alert-error">' + data.affected + ' registo(s) serão eliminados de forma permanente.</div><button class="btn btn-danger btn-block" data-a="run">Eliminar ' + data.affected + ' registo(s)</button>'
        : '<div class="alert alert-ok">Nada para limpar.</div>';
    } else if (b.dataset.a === 'run') {
      if (!confirm('Eliminar de forma permanente? Esta acção não pode ser desfeita.')) { b.disabled = false; return; }
      const { data, error } = await db.rpc('run_cleanup', { p_task: task.id, p_param: param, p_dry_run: false });
      if (error) throw error;
      out.innerHTML = '<div class="alert alert-ok">Eliminados: ' + data.affected + '.</div>';
      toast('Limpeza concluída.'); loadUsage();
    }
  } catch (err) { out.innerHTML = '<div class="alert alert-error">' + esc(errMsg(err)) + '</div>'; }
  b.disabled = false;
}

async function exportAudit(months) {
  const cut = new Date(); cut.setMonth(cut.getMonth() - months);
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await db.from('audit_logs').select('id,created_at,obra_id,user_id,action,table_name,record_id,details')
      .lt('created_at', cut.toISOString()).order('id').range(from, from + 999);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < 1000 || all.length >= 50000) break;
    from += 1000;
  }
  if (!all.length) { toast('Não há registos de auditoria para exportar.'); return; }
  downloadCSV('donac_auditoria_antes_de_' + cut.toISOString().slice(0, 10) + '.csv',
    ['Data', 'Obra', 'Utilizador', 'Acção', 'Tabela', 'Registo', 'Detalhes'],
    all.map(r => [r.created_at, r.obra_id || '', r.user_id || '', r.action, r.table_name || '', r.record_id || '', r.details ? JSON.stringify(r.details) : '']));
  toast(all.length + ' registos exportados.');
}

async function backup() {
  const btn = $('#btn-backup'), msg = $('#bk-msg');
  btn.disabled = true;
  const out = { app: 'DONAC', version: 1, exported_at: new Date().toISOString(), tables: {} };
  try {
    for (const t of BACKUP_TABLES) {
      msg.className = 'alert alert-ok'; msg.textContent = 'A copiar ' + t + '...';
      let all = [], from = 0;
      for (;;) {
        const { data, error } = await db.from(t).select('*').order('id').range(from, from + 999);
        if (error) throw error;
        all = all.concat(data);
        if (data.length < 1000) break;
        from += 1000;
        if (all.length >= 200000) throw new Error('A tabela ' + t + ' é demasiado grande para exportar daqui.');
      }
      out.tables[t] = all;
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'donac_copia_' + todayISO() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    msg.className = 'alert alert-ok';
    msg.textContent = 'Cópia concluída: ' + BACKUP_TABLES.map(t => t + ' ' + out.tables[t].length).join(' · ');
  } catch (e) { msg.className = 'alert alert-error'; msg.textContent = errMsg(e); }
  btn.disabled = false;
}
