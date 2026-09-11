/* Arranque, navegación y utilidades compartidas entre vistas */
(function (root) {
  const CFG = root.SP_CONFIG || {};
  const APP = { views: {}, current: null };

  APP.register = (name, view) => { APP.views[name] = view; };
  APP.NAV = [
    { k: 'seguimiento', label: 'Seguimiento' },
    { k: 'calendario', label: 'Calendario E. Directas' },
    { k: 'compradores', label: 'Compradores' },
    { k: 'reporte', label: 'Reporte mensual' },
    { k: 'catalogos', label: 'Catálogos' },
    { k: 'datos', label: 'Datos y bitácora' },
  ];

  /* ---------- Barra de filtros reutilizable ---------- */
  // spec: [{k, label, type:'select'|'search'|'seg', options:()=>[], empty:'Todos', wide}]
  APP.filterBar = function (container, spec, state, onChange, { actions } = {}) {
    container.innerHTML = `<div class="filters">${spec.map((s) => {
      if (s.type === 'search') return `<div class="flt flt-wide"><label for="flt_${s.k}">${U.esc(s.label)}</label><input id="flt_${s.k}" type="search" data-k="${s.k}" value="${U.esc(state[s.k] || '')}" placeholder="${U.esc(s.placeholder || '')}"></div>`;
      const opts = s.options();
      return `<div class="flt ${s.wide ? 'flt-wide' : ''}"><label for="flt_${s.k}">${U.esc(s.label)}</label><select id="flt_${s.k}" data-k="${s.k}">${U.options(opts, state[s.k], s.empty === null ? {} : { empty: s.empty ?? 'Todos' })}</select></div>`;
    }).join('')}${actions ? `<div class="flt flt-actions">${actions}</div>` : ''}</div>`;
    U.$$('[data-k]', container).forEach((el) => {
      const fire = () => { state[el.dataset.k] = el.value; onChange(el.dataset.k); };
      if (el.tagName === 'INPUT') el.addEventListener('input', U.debounce(fire, 250)); else el.addEventListener('change', fire);
    });
  };
  APP.anios = () => U.uniq(S.pedidos.map((p) => { const m = C.mesSolicitud(p); return m ? m.anio : null; }).concat(S.pedidos.map((p) => U.iso(p.fecha_estimada) ? +U.iso(p.fecha_estimada).slice(0, 4) : null)).concat([+S.hoy.slice(0, 4)])).sort((a, b) => b - a);
  APP.mesesOpts = () => U.MESES.map((m, i) => ({ value: String(i + 1), label: m.charAt(0) + m.slice(1).toLowerCase() }));
  APP.moduloOpts = () => C.MODULOS;

  /* ---------- Usuario ---------- */
  APP.pickUser = function (force) {
    if (S.user && !force) return;
    const names = S.usuarios();
    const m = UI.modal({
      title: '¿Quién eres?', subtitle: 'Tu nombre queda registrado en la bitácora de cada cambio que hagas. No hay contraseña.',
      body: `<div class="fld"><label for="u_sel">Selecciona tu nombre</label><select id="u_sel">${U.options(names, S.user, { empty: '— Selecciona —' })}</select></div>
             <div class="fld"><label for="u_txt">…o escríbelo si no aparece</label><input id="u_txt" type="text" placeholder="Nombre y apellido"></div>`,
      footer: `<button class="btn btn-ghost" data-a="skip">Solo consultar</button><button class="btn btn-primary" data-a="ok">Continuar</button>`,
    });
    U.$('[data-a="skip"]', m.el).onclick = () => m.close();
    U.$('[data-a="ok"]', m.el).onclick = () => {
      const n = U.$('#u_txt', m.el).value.trim() || U.$('#u_sel', m.el).value;
      if (!n) { UI.toast('Selecciona o escribe tu nombre', 'warn'); return; }
      S.setUser(n); m.close(); UI.toast(`Hola, ${S.user}`);
    };
  };

  /* ---------- Navegación ---------- */
  function renderShell() {
    document.title = CFG.TITULO || 'Portal de Seguimiento de Pedidos';
    U.$('#app').innerHTML = `
      <header class="top">
        <div class="top-row">
          <div class="brand"><h1>${U.esc(CFG.TITULO || 'Portal de Seguimiento de Pedidos')}</h1><p>Sobrepedido · Entregas directas · Pedido especial · Tickets — Área de Compras</p></div>
          <div class="top-actions">
            <span class="pill">${U.esc(CFG.EMPRESA || '')}</span>
            <button class="user-chip" id="userChip" title="Cambiar usuario"><span class="avatar">👤</span><span id="userName">${U.esc(S.user || 'Sin usuario')}</span></button>
            <button class="btn btn-light btn-sm" id="btnRefresh" title="Volver a cargar datos">⟳ Actualizar</button>
          </div>
        </div>
        <nav class="tabs" role="tablist">${APP.NAV.map((n) => `<a href="#/${n.k}" data-nav="${n.k}" role="tab">${U.esc(n.label)}</a>`).join('')}</nav>
      </header>
      <main id="view" tabindex="-1"></main>
      <footer class="foot"><span id="lastLoad"></span><span>Datos en Supabase · Cambios registrados en bitácora</span></footer>`;
    U.$('#userChip').onclick = () => APP.pickUser(true);
    U.$('#btnRefresh').onclick = () => APP.reload();
    S.on((w) => { if (w === 'user') U.$('#userName').textContent = S.user || 'Sin usuario'; });
  }
  APP.go = function () {
    const name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'seguimiento';
    const view = APP.views[name] || APP.views.seguimiento;
    APP.current = name;
    U.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    const c = U.$('#view'); c.innerHTML = '';
    try { view.render(c); } catch (e) { console.error(e); c.innerHTML = `<div class="card error-card"><h3>Error al mostrar la pantalla</h3><pre>${U.esc(e.stack || e.message)}</pre></div>`; }
  };
  APP.rerender = () => { const v = APP.views[APP.current]; if (v && v.refresh) v.refresh(); else APP.go(); };

  APP.reload = async function () {
    const ld = UI.loading('Cargando pedidos…');
    try {
      await S.loadAll((n) => ld.text(`Cargando pedidos… ${U.fmtNum(n)}`));
      U.$('#lastLoad').textContent = `Actualizado ${new Date().toLocaleString('es-MX')} · ${U.fmtNum(S.pedidos.length)} claves activas`;
      APP.rerender();
    } catch (e) {
      console.error(e);
      U.$('#view').innerHTML = `<div class="card error-card"><h3>No se pudieron cargar los datos</h3><p>${U.esc(e.message)}</p>
        <p class="muted">Si es la primera vez: 1) ejecuta <b>supabase/schema.sql</b> en el SQL Editor de Supabase, 2) revisa la llave en <b>assets/js/config.js</b>, 3) entra a <b>Datos y bitácora</b> para la carga inicial.</p>
        <button class="btn btn-primary" onclick="APP.reload()">Reintentar</button> <a class="btn btn-ghost" href="#/datos" onclick="setTimeout(APP.go)">Ir a Datos</a></div>`;
    } finally { UI.loading(false); }
  };

  function renderSetup() {
    U.$('#app').innerHTML = `<div class="setup card">
      <h1>Falta configurar la conexión</h1>
      <p>Abre <code>assets/js/config.js</code> en el repositorio y pega la llave pública de Supabase en <code>SUPABASE_KEY</code>.</p>
      <ol><li>Supabase → Project Settings → API Keys.</li><li>Copia la llave <b>anon public</b> (legacy, empieza con <code>eyJ</code>) o la <b>publishable</b> (<code>sb_publishable_…</code>).</li><li>Guarda el archivo en GitHub y recarga esta página.</li></ol>
      <p class="muted">Nunca uses la llave <b>service_role</b> ni la <b>secret</b>: darían control total de la base.</p></div>`;
  }

  APP.start = async function () {
    API.init(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
    if (!API.configurada()) { renderSetup(); return; }
    renderShell();
    window.addEventListener('hashchange', APP.go);
    APP.go();
    await APP.reload();
    if (!S.user) APP.pickUser();
  };

  root.APP = APP;
  document.addEventListener('DOMContentLoaded', () => APP.start());
})(window);
