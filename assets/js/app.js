/* Arranque, navegación y utilidades compartidas entre vistas */
(function (root) {
  const CFG = root.SP_CONFIG || {};
  const APP = { views: {}, current: null };

  APP.register = (name, view) => { APP.views[name] = view; };
  APP.NAV = [
    { k: 'sobrepedido', label: 'Sobrepedido' },
    { k: 'entregas', label: 'Entregas directas' },
    { k: 'calendario', label: 'Calendario E. Directas' },
    { k: 'tickets', label: 'Tickets' },
    { k: 'compradores', label: 'Compradores' },
    { k: 'reporte', label: 'Reporte mensual' },
    { k: 'catalogos', label: 'Catálogos' },
    { k: 'datos', label: 'Datos y bitácora' },
  ];

  /* ---------- Barra de filtros reutilizable ---------- */
  // spec: [{k, label, type:'select'|'search'|'seg', options:()=>[], empty:'Todos', wide}]
  // v1.8.0: los filtros con {more:true} van en "Más filtros" (se abre y cierra; se recuerda con masKey)
  APP.filterBar = function (container, spec, state, onChange, { actions, masKey } = {}) {
    const campo = (s) => {
      const cls = `${s.more ? 'flt-more' : ''}`;
      if (s.type === 'search') return `<div class="flt flt-wide ${cls}"><label for="flt_${s.k}">${U.esc(s.label)}</label><input id="flt_${s.k}" type="search" data-k="${s.k}" value="${U.esc(state[s.k] || '')}" placeholder="${U.esc(s.placeholder || '')}"></div>`;
      if (s.type === 'date') return `<div class="flt ${cls}"><label for="flt_${s.k}">${U.esc(s.label)}</label><input id="flt_${s.k}" type="date" data-k="${s.k}" value="${U.esc(state[s.k] || '')}"></div>`;
      const opts = s.options();
      return `<div class="flt ${s.wide ? 'flt-wide' : ''} ${cls}"><label for="flt_${s.k}">${U.esc(s.label)}</label><select id="flt_${s.k}" data-k="${s.k}">${U.options(opts, state[s.k], s.empty === null ? {} : { empty: s.empty ?? 'Todos' })}</select></div>`;
    };
    const principales = spec.filter((s) => !s.more), mas = spec.filter((s) => s.more);
    let abierto = false;
    if (mas.length && masKey) { try { abierto = localStorage.getItem(`sp_flt_mas_${masKey}`) === '1'; } catch { /* sin storage */ } }
    const textoMas = () => {
      const n = mas.filter((s) => !U.blank(state[s.k])).length;
      return `${abierto ? 'Menos filtros ▴' : 'Más filtros ▾'}${n ? ` <b class="cnt" title="Filtros activos que no se ven">${n}</b>` : ''}`;
    };
    const btnMas = mas.length ? `<button class="btn btn-ghost btn-sm btn-mas" type="button" data-mas="1">${textoMas()}</button>` : '';
    container.innerHTML = `<div class="filters ${mas.length && !abierto ? 'colapsado' : ''}">${principales.map(campo).join('')}${(actions || btnMas) ? `<div class="flt flt-actions">${btnMas}${actions || ''}</div>` : ''}${mas.map(campo).join('')}</div>`;
    const bMas = U.$('[data-mas]', container);
    if (bMas) bMas.onclick = () => {
      abierto = !abierto;
      if (masKey) { try { localStorage.setItem(`sp_flt_mas_${masKey}`, abierto ? '1' : '0'); } catch { /* sin storage */ } }
      U.$('.filters', container).classList.toggle('colapsado', !abierto);
      bMas.innerHTML = textoMas();
      setTimeout(APP.medirTop, 20);
    };
    U.$$('[data-k]', container).forEach((el) => {
      const fire = () => { state[el.dataset.k] = el.value; if (bMas) bMas.innerHTML = textoMas(); onChange(el.dataset.k); };
      if (el.tagName === 'INPUT' && el.type !== 'date') el.addEventListener('input', U.debounce(fire, 250)); else el.addEventListener('change', fire);
    });
  };
  APP.anios = () => U.uniq(S.pedidos.map((p) => { const m = C.mesSolicitud(p); return m ? m.anio : null; }).concat(S.pedidos.map((p) => U.iso(p.fecha_estimada) ? +U.iso(p.fecha_estimada).slice(0, 4) : null)).concat([+S.hoy.slice(0, 4)])).sort((a, b) => b - a);
  APP.mesesOpts = () => U.MESES.map((m, i) => ({ value: String(i + 1), label: m.charAt(0) + m.slice(1).toLowerCase() }));
  APP.moduloOpts = () => C.MODULOS;

  /* ---------- Usuario y sesión de edición ---------- */
  APP.pickUser = function (force) {
    if (S.user && !force) return;
    const names = S.usuarios();
    const m = UI.modal({
      title: '¿Quién eres?', subtitle: 'Tu nombre queda registrado en la bitácora de cada cambio que hagas.',
      body: `<div class="fld"><label for="u_sel">Selecciona tu nombre</label><select id="u_sel">${U.options(names, S.user, { empty: '— Selecciona —' })}</select></div>
             <div class="fld"><label for="u_txt">…o escríbelo si no aparece</label><input id="u_txt" type="text" placeholder="Nombre y apellido"></div>`,
      footer: `<button class="btn btn-ghost" data-a="skip">Cancelar</button><button class="btn btn-primary" data-a="ok">Continuar</button>`,
    });
    U.$('[data-a="skip"]', m.el).onclick = () => m.close();
    U.$('[data-a="ok"]', m.el).onclick = () => {
      const n = U.$('#u_txt', m.el).value.trim() || U.$('#u_sel', m.el).value;
      if (!n) { UI.toast('Selecciona o escribe tu nombre', 'warn'); return; }
      S.setUser(n); m.close(); UI.toast(`Hola, ${S.user}`);
    };
  };

  /** Pantalla para entrar con la contraseña de captura */
  APP.entrar = function (motivo) {
    if (S.puedeEditar()) return;
    const names = S.usuarios();
    const m = UI.modal({
      title: 'Entrar para editar',
      subtitle: motivo || 'Sin contraseña puedes consultar y descargar la información, pero no capturar ni modificar.',
      body: `<form class="pf" autocomplete="off" id="loginForm">
        <div class="fld"><label for="lg_pass">Contraseña de captura *</label><input id="lg_pass" type="password" autocomplete="current-password" placeholder="La contraseña del área de compras"></div>
        <div class="fld"><label for="lg_sel">¿Quién eres? (queda en la bitácora) *</label><select id="lg_sel">${U.options(names, S.user, { empty: '— Selecciona —' })}</select></div>
        <div class="fld"><label for="lg_txt">…o escribe tu nombre si no aparece</label><input id="lg_txt" type="text" placeholder="Nombre y apellido" value="${U.esc(S.user && !names.includes(S.user) ? S.user : '')}"></div>
        <div id="lg_err"></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-a="c">Solo consultar</button><button class="btn btn-primary" data-a="ok">Entrar</button>`,
    });
    const err = (t) => { U.$('#lg_err', m.el).innerHTML = t ? `<div class="error-box">${U.esc(t)}</div>` : ''; };
    U.$('[data-a="c"]', m.el).onclick = () => m.close();
    const enviar = async () => {
      const pass = U.$('#lg_pass', m.el).value;
      const nombre = U.$('#lg_txt', m.el).value.trim() || U.$('#lg_sel', m.el).value;
      if (!pass) { err('Escribe la contraseña.'); return; }
      if (!nombre) { err('Selecciona o escribe tu nombre.'); return; }
      const btn = U.$('[data-a="ok"]', m.el); btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        await S.entrar(pass, nombre);
        m.close();
        UI.toast(`Modo edición activado. Hola, ${S.user}`);
      } catch (e) { err(e.message); btn.disabled = false; btn.textContent = 'Entrar'; }
    };
    U.$('[data-a="ok"]', m.el).onclick = enviar;
    U.$('#loginForm', m.el).addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
    setTimeout(() => { const i = U.$('#lg_pass', m.el); if (i) i.focus(); }, 60);
  };
  /** Úsalo antes de cualquier acción que escriba en la base */
  APP.requiereEdicion = function (motivo) {
    if (!S.puedeEditar()) { APP.entrar(motivo); return false; }
    if (!S.user) { APP.pickUser(true); return false; }
    return true;
  };
  APP.salir = function () {
    S.cerrarSesion();
    UI.toast('Saliste del modo edición: ahora solo puedes consultar.');
  };

  /** Mide el alto del encabezado para que los filtros y los títulos de tabla se queden fijos debajo */
  APP.medirTop = function () {
    const t = U.$('.top');
    if (t) document.documentElement.style.setProperty('--top-h', `${Math.round(t.getBoundingClientRect().height)}px`);
    const f = U.$('.card-filtros');
    document.documentElement.style.setProperty('--flt-h', f ? `${Math.round(f.getBoundingClientRect().height)}px` : '0px');
  };

  /* ---------- Navegación ---------- */
  function renderShell() {
    document.title = CFG.TITULO || 'Portal de Seguimiento de Pedidos';
    U.$('#app').innerHTML = `
      <header class="top">
        <div class="top-row">
          <div class="brand" title="Sobrepedido · Entregas directas · Pedido especial · Tickets — Área de Compras"><h1>${U.esc(CFG.TITULO || 'Portal de Seguimiento de Pedidos')}</h1><p>Sobrepedido · Entregas directas · Pedido especial · Tickets — Área de Compras</p></div>
          <div class="top-actions">
            <span class="pill">${U.esc(CFG.EMPRESA || '')}</span>
            <span id="sesionBox"></span>
            <button class="btn btn-light btn-sm" id="btnRefresh" title="Volver a cargar datos">⟳ Actualizar</button>
          </div>
        </div>
        <nav class="tabs" role="tablist">${APP.NAV.map((n) => `<a href="#/${n.k}" data-nav="${n.k}" role="tab">${U.esc(n.label)}</a>`).join('')}</nav>
      </header>
      <main id="view" tabindex="-1"></main>
      <footer class="foot"><span id="lastLoad"></span><span>Datos en Supabase · Cambios registrados en bitácora</span></footer>`;
    U.$('#btnRefresh').onclick = () => APP.reload();
    pintarSesion();
    S.on((w) => { if (w === 'user' || w === 'sesion') { pintarSesion(); if (w === 'sesion') APP.go(); } });
  }
  /** Chip de la esquina: modo edición (con nombre) o solo lectura */
  function pintarSesion() {
    const box = U.$('#sesionBox'); if (!box) return;
    box.innerHTML = S.puedeEditar()
      ? `<button class="user-chip" id="userChip" title="Cambiar nombre"><span class="avatar">✏️</span><span id="userName">${U.esc(S.user || 'Sin usuario')}</span></button><button class="btn btn-light btn-sm" id="btnSalir" title="Salir del modo edición">Salir</button>`
      : `<span class="pill pill-ro" title="Cualquiera con el link puede consultar y descargar">🔒 Solo lectura</span><button class="btn btn-light btn-sm" id="btnEntrar">Entrar para editar</button>`;
    const chip = U.$('#userChip'); if (chip) chip.onclick = () => APP.pickUser(true);
    const salir = U.$('#btnSalir'); if (salir) salir.onclick = () => APP.salir();
    const entrar = U.$('#btnEntrar'); if (entrar) entrar.onclick = () => APP.entrar();
  }

  APP.go = function () {
    let name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'sobrepedido';
    if (name === 'seguimiento') { location.hash = '#/sobrepedido'; return; } // compatibilidad con la pestaña anterior
    const view = APP.views[name] || APP.views.sobrepedido;
    if (!APP.views[name]) name = 'sobrepedido';
    APP.current = name;
    U.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    const c = U.$('#view'); c.innerHTML = ''; c.className = '';
    try { view.render(c); } catch (e) { console.error(e); c.innerHTML = `<div class="card error-card"><h3>Error al mostrar la pantalla</h3><pre>${U.esc(e.stack || e.message)}</pre></div>`; }
    setTimeout(APP.medirTop, 30);
  };
  APP.rerender = () => { const v = APP.views[APP.current]; if (v && v.refresh) v.refresh(); else APP.go(); };

  APP.reload = async function () {
    const ld = UI.loading('Cargando pedidos…');
    try {
      await S.loadAll((n) => ld.text(`Cargando pedidos… ${U.fmtNum(n)}`));
      U.$('#lastLoad').textContent = `Actualizado ${new Date().toLocaleString('es-MX')} · ${U.fmtNum(S.pedidos.length)} claves activas`;
      // En las pantallas de tabla el pie de página se oculta: la hora de carga queda en el botón
      U.$('#btnRefresh').title = `Volver a cargar datos · ${U.$('#lastLoad').textContent}`;
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
    await S.restaurarSesion();
    renderShell();
    window.addEventListener('hashchange', APP.go);
    window.addEventListener('resize', U.debounce(APP.medirTop, 200));
    APP.go();
    await APP.reload();
    // Renueva el token cada 10 minutos mientras el portal esté abierto
    setInterval(() => { if (S.puedeEditar()) API.revisarSesion().catch(() => {}); }, 600000);
  };

  root.APP = APP;
  document.addEventListener('DOMContentLoaded', () => APP.start());
})(window);
