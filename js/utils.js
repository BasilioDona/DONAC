// Utilitarios partilhados: DOM, escape XSS, icones SVG, estrutura da aplicacao.
const $ = (sel, root = document) => root.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
  entry: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  exit: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  checks: '<path d="M4 6l2 2 3-3M4 14l2 2 3-3M12 7h8M12 15h8"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  file: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
  absent: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>'
};

function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showFatal(err) {
  console.error(err);
  const app = $('#app');
  if (app) app.innerHTML = '<div class="page" style="padding:20px"><div class="alert alert-error">' +
    'Ocorreu um erro ao carregar. Verifique a ligação e tente novamente.</div>' +
    '<button class="btn" onclick="location.reload()">Tentar novamente</button></div>';
}

// Desenha cabecalho + navegacao (inferior no telemovel, lateral no ecra grande).
// Devolve o elemento onde cada pagina escreve o seu conteudo.
function renderShell({ ctxLabel, menu, active }) {
  const links = menu.map(m =>
    '<a href="' + esc(m.href) + '" class="' + (m.id === active ? 'active' : '') + '">' +
    icon(m.icon) + '<span>' + esc(m.label) + '</span></a>').join('');
  $('#app').innerHTML =
    '<header class="topbar"><span class="brand">DONAC</span>' +
    '<span class="ctx">' + esc(ctxLabel) + '</span>' +
    '<button class="icon-btn" id="btn-logout" aria-label="Terminar sessão">' + icon('logout') + '</button></header>' +
    '<nav class="nav">' + links + '</nav>' +
    '<main><div class="page" id="content"></div></main>';
  $('#btn-logout').addEventListener('click', signOut);
  return $('#content');
}

// ---- Fase 2: icones e ajudantes ----
ICONS.key = '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>';
ICONS.close = '<path d="M6 6l12 12M18 6L6 18"/>';

function openModal(title, html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>' + esc(title) +
    '</h2><button class="icon-btn dark" data-close aria-label="Fechar">' + icon('close') +
    '</button></div><div class="modal-body">' + html + '</div></div>';
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  return { el: back, body: back.querySelector('.modal-body'), close };
}

function errMsg(e) {
  if (!e) return 'Erro desconhecido.';
  if (e.code === '23505') return 'Já existe um registo com estes dados.';
  if (e.code === '23503') return 'Operação bloqueada por dados relacionados.';
  return e.message || 'Falha na operação.';
}

function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).slice(0, 10).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }

function randomPassword(len) {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const a = new Uint32Array(len || 12);
  crypto.getRandomValues(a);
  return Array.from(a, x => cs[x % cs.length]).join('');
}

// ---- Fase 3 ----
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('pt-PT', { maximumFractionDigits: 3 });
}
function parseQty(v) {
  const n = parseFloat(String(v || '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// ---- Fase 4 ----
ICONS.home = '<path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-5h4v5"/>';

// ---- Fase 5 ----
ICONS.alert = '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>';

function csvCell(v) {
  if (v === null || v === undefined) return '""';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/^[=+@]/.test(s) || /^-[^0-9.,\s]/.test(s)) s = "'" + s;   // evita fórmulas no Excel
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCSV(filename, head, rows) {
  const body = [head].concat(rows).map(r => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
