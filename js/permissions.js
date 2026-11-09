// Menus dinamicos por permissao. A seguranca real esta no RLS/funcoes do PostgreSQL;
// isto apenas decide o que mostrar. 'ready: false' = modulo ainda nao construido (nao aparece).
const ROLE_LABELS = {
  gestor_armazem: 'Gestor de Armazém',
  gestor_pessoal: 'Gestor de Pessoal',
  gestor_obra: 'Gestor de Obra'
};

const MENU_SUPER = [
  { id: 'dashboard',  label: 'Dashboard',  icon: 'dashboard', href: 'admin.html',      ready: true },
  { id: 'obras',      label: 'Obras',      icon: 'building',  href: 'obras.html',      ready: true },
  { id: 'utilizadores', label: 'Utilizadores', icon: 'users', href: 'utilizadores.html', ready: true },
  { id: 'permissoes', label: 'Permissões', icon: 'shield',    href: 'permissoes.html', ready: false },
  { id: 'auditoria',  label: 'Auditoria',  icon: 'clipboard', href: 'auditoria.html',  ready: false },
  { id: 'admins',     label: 'Super Admins', icon: 'shield',   href: 'administradores.html', ready: true },
  { id: 'registos',   label: 'Eliminar registos', icon: 'clipboard', href: 'registos.html', ready: true },
  { id: 'manutencao', label: 'Manutenção', icon: 'settings', href: 'manutencao.html', ready: true },
  { id: 'conta',      label: 'Conta',      icon: 'key',       href: 'conta.html',      ready: true },
  { id: 'config',     label: 'Configurações', icon: 'settings', href: 'configuracoes.html', ready: false }
];

// need: modulo exigido (null = sempre visivel)
const MENU_OBRA = [
  { id: 'dashboard',   label: 'Dashboard',    icon: 'dashboard', href: 'dashboard.html',   need: null, ready: true },
  { id: 'materiais',   label: 'Materiais',    icon: 'box',       href: 'materiais.html',   need: 'warehouse', ready: true },
  { id: 'entradas',    label: 'Entradas',     icon: 'entry',     href: 'entradas.html',    need: 'warehouse', ready: true },
  { id: 'saidas',      label: 'Saídas',       icon: 'exit',      href: 'saidas.html',      need: 'warehouse', ready: true },
  { id: 'inventario',  label: 'Inventário',   icon: 'checks',    href: 'inventario.html',  need: 'inventory', ready: true },
  { id: 'movimentos',  label: 'Movimentações', icon: 'list',     href: 'movimentacoes.html', need: 'warehouse', ready: true },
  { id: 'alertas',     label: 'Alertas',      icon: 'alert',     href: 'alertas.html',     needAny: ['warehouse', 'inventory'], ready: true },
  { id: 'funcionarios', label: 'Funcionários', icon: 'users',    href: 'funcionarios.html', need: 'staff', ready: true },
  { id: 'presencas',   label: 'Presenças',    icon: 'calendar',  href: 'presencas.html',   need: 'staff', ready: true },
  { id: 'faltas',      label: 'Faltas',       icon: 'absent',    href: 'faltas.html',      need: 'staff', ready: true },
  { id: 'ferias',      label: 'Férias',       icon: 'home',      href: 'ferias.html',      need: 'staff', ready: true },
  { id: 'relatorios',  label: 'Relatórios',   icon: 'file',      href: 'relatorios.html',  needAny: ['staff', 'reports'], ready: true },
  { id: 'conta',       label: 'Conta',        icon: 'key',       href: 'conta.html',       need: null, ready: true }
];

function can(ctx, module) {
  const m = ctx && ctx.membership;
  if (!m) return false;
  if (m.can_admin) return true;
  return {
    warehouse: m.can_warehouse, staff: m.can_staff,
    inventory: m.can_inventory, reports: m.can_reports
  }[module] === true;
}

function buildMenu(ctx) {
  if (ctx.is_super_admin) return MENU_SUPER.filter(i => i.ready);
  return MENU_OBRA.filter(i => i.ready && (i.needAny ? i.needAny.some(m => can(ctx, m)) : (i.need === null || can(ctx, i.need))));
}

function authorizedModuleLabels(ctx) {
  const out = [];
  if (can(ctx, 'warehouse')) out.push('Armazém');
  if (can(ctx, 'inventory')) out.push('Inventário');
  if (can(ctx, 'staff')) out.push('Pessoal');
  if (can(ctx, 'reports')) out.push('Relatórios');
  if (ctx.membership && ctx.membership.can_admin) out.push('Administração da obra');
  return out;
}

// Arranque comum das páginas da obra: guarda, menu e verificação de módulo
async function bootObraPage(active, mods, build) {
  try {
    const ctx = await guard('obra');
    if (!ctx) return;
    const m = ctx.membership;
    const content = renderShell({ ctxLabel: m.obra_name, menu: buildMenu(ctx), active });
    if (!mods.some(x => can(ctx, x))) {
      content.innerHTML = '<div class="alert alert-error">Não tem permissão para este módulo.</div>';
      return;
    }
    await build(ctx, content, m.obra_id);
  } catch (e) { showFatal(e); }
}

