/* Vista: Catálogos editables */
(function () {
  const DEFS = {
    te: { label: 'Tiempos de entrega', help: 'Proveedor + solicitante → días de entrega. Se usa para calcular la fecha estimada al capturar.', cols: [
      { k: 'proveedor', label: 'Proveedor', list: 'PROVEEDOR', w: '220px' }, { k: 'solicitante', label: 'Solicitante', list: 'SOLICITANTE' },
      { k: 'entrega_directa', label: 'Entrega directa', opts: ['SI', 'NO'] }, { k: 'tiempo_entrega', label: 'Tiempo de entrega (texto)' },
      { k: 'dias_inicio', label: 'Días inicio', num: true }, { k: 'dias_fin', label: 'Días fin', num: true }, { k: 'tipo_dias', label: 'Tipo de días', opts: ['NATURALES', 'HABILES'] }] },
    td: { label: 'Tiempos de descarga', help: 'Horas de descarga por proveedor y tipo de material. Alimenta las horas del calendario.', cols: [
      { k: 'proveedor', label: 'Proveedor', list: 'PROVEEDOR', w: '220px' }, { k: 'marca', label: 'Marca', list: 'MARCA' }, { k: 'tipo_material', label: 'Tipo de material' }, { k: 'horas', label: 'Horas', num: true }] },
    dnr: { label: 'Días de no recepción', help: 'Día de la semana en que la sucursal no recibe entregas directas. Se marca en el calendario y avisa al capturar.', cols: [
      { k: 'solicitante', label: 'Solicitante', list: 'SOLICITANTE' }, { k: 'dia', label: 'Día que no recibe', opts: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'] }] },
    inh: { label: 'Días inhábiles', help: 'Festivos y días sin operación. Se descuentan al calcular días hábiles y días de incumplimiento.', cols: [
      { k: 'fecha', label: 'Fecha', date: true }, { k: 'descripcion', label: 'Descripción', w: '260px' }] },
    cats: { label: 'Categorías de tickets', help: 'Días de cotización por categoría del ticket. Cada día equivale a 8.5 horas hábiles (8:00-13:30 y 15:00-18:00, de lunes a viernes) y definen la fecha y hora límite de cotización. La misma categoría escrita con y sin acentos cuenta como una sola.', cols: [
      { k: 'categoria', label: 'Categoría', w: '380px' }, { k: 'dias', label: 'Días de cotización', num: true }] },
    listas: { label: 'Listas desplegables', help: 'Valores sugeridos en capturas (compradores, áreas, solicitantes, proveedores…). Los valores que ya existen en los pedidos se agregan solos.', cols: [
      { k: 'lista', label: 'Lista', opts: ['COMPRADOR', 'AREA', 'SOLICITANTE', 'PROVEEDOR', 'MARCA', 'UNIDAD', 'TIPO_SOLICITUD', 'USUARIO'] }, { k: 'valor', label: 'Valor', w: '260px' },
      { k: 'modulo', label: 'Módulo (vacío = todos)', opts: ['SOBREPEDIDO', 'ENTREGA_DIRECTA', 'TICKET'] }] },
  };
  const st = { tab: 'te', q: '', page: 0, inactivos: false };
  let root = null;
  const PAGE = 100;

  function input(col, v) {
    const val = v === null || v === undefined ? '' : v;
    if (col.opts) return `<select data-k="${col.k}">${U.options(col.opts, val, { empty: '—' })}</select>`;
    if (col.date) return `<input type="date" data-k="${col.k}" value="${U.esc(U.iso(val) || '')}">`;
    if (col.num) return `<input type="number" step="any" data-k="${col.k}" value="${U.esc(val)}">`;
    return `<input type="text" data-k="${col.k}" value="${U.esc(val)}" ${col.list ? `list="dl_${col.list}"` : ''}>`;
  }

  function draw() {
    const def = DEFS[st.tab];
    U.$('#catBody', root).innerHTML = `
      <p class="muted">${U.esc(def.help)}</p>
      <div class="cat-tools"><input type="search" id="catQ" placeholder="Buscar…" value="${U.esc(st.q)}" aria-label="Buscar en catálogo"><label class="chk"><input type="checkbox" id="catIn" ${st.inactivos ? 'checked' : ''}> Ver desactivados</label><span class="spacer"></span>${st.tab === 'cats' && S.puedeEditar() && S.categoriasRepetidas().sobran.length ? `<button class="btn btn-ghost btn-sm" id="catDup" title="Desactiva las que están repetidas sin acentos y pasa los tickets a la que se queda">🧹 Quitar repetidas (${S.categoriasRepetidas().sobran.length})</button>` : ''}${S.puedeEditar() ? '<button class="btn btn-primary btn-sm" id="catAdd">＋ Agregar</button>' : '<button class="btn btn-primary btn-sm" id="catEntrar">🔒 Entrar para editar</button>'}</div>
      <div id="catTable"></div>${UI.datalists(['PROVEEDOR', 'SOLICITANTE', 'MARCA'])}`;
    U.$('#catQ', root).addEventListener('input', U.debounce((e) => { st.q = e.target.value; st.page = 0; drawTable(); }, 300));
    U.$('#catIn', root).onchange = (e) => { st.inactivos = e.target.checked; drawTable(); };
    const catDup = U.$('#catDup', root);
    if (catDup) catDup.onclick = async () => {
      const { sobran } = S.categoriasRepetidas();
      if (!(await UI.confirm(`Se desactivarán ${sobran.length} categorías repetidas (se queda la versión con acentos) y los tickets que las usan pasarán a esa. ¿Continuar?`))) return;
      const ld = UI.loading('Quitando categorías repetidas…');
      try { const r = await S.limpiarCategoriasRepetidas(); UI.toast(`${r.desactivadas} categorías repetidas desactivadas · ${r.tickets} renglón(es) de tickets actualizados`); draw(); }
      catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
    };
    const catEntrar = U.$('#catEntrar', root); if (catEntrar) catEntrar.onclick = () => APP.entrar('Para agregar o cambiar catálogos necesitas la contraseña.');
    const catAdd = U.$('#catAdd', root); if (catAdd) catAdd.onclick = () => {
      const tb = U.$('#catTable tbody', root);
      if (tb.querySelector('tr[data-id="new"]')) return;
      const tr = U.h(`<table><tr data-id="new" class="row-new">${def.cols.map((c) => `<td>${input(c, c.k === 'lista' ? 'COMPRADOR' : '')}</td>`).join('')}<td><input type="checkbox" data-k="activo" checked></td><td><button class="btn btn-sm btn-success" data-save>Guardar</button></td></tr></table>`).querySelector('tr');
      tb.prepend(tr); bindRow(tr); tr.querySelector('input,select').focus();
    };
    drawTable();
  }

  function drawTable() {
    const def = DEFS[st.tab];
    const q = U.norm(st.q);
    const all = S.cat[st.tab].filter((r) => (st.inactivos || r.activo !== false) && (!q || U.norm(def.cols.map((c) => r[c.k]).join(' ')).includes(q)));
    const pages = Math.max(1, Math.ceil(all.length / PAGE)); if (st.page >= pages) st.page = pages - 1;
    const rows = all.slice(st.page * PAGE, (st.page + 1) * PAGE);
    const box = U.$('#catTable', root);
    box.innerHTML = `<div class="table-wrap"><table class="grid compact cat"><thead><tr>${def.cols.map((c) => `<th style="min-width:${c.w || '120px'}">${U.esc(c.label)}</th>`).join('')}<th>Activo</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr data-id="${r.id}" class="${r.activo === false ? 'row-off' : ''}">${def.cols.map((c) => `<td>${input(c, r[c.k])}</td>`).join('')}<td><input type="checkbox" data-k="activo" ${r.activo !== false ? 'checked' : ''} aria-label="Activo"></td><td><button class="btn btn-sm btn-primary" data-save disabled>Guardar</button></td></tr>`).join('') || `<tr><td colspan="${def.cols.length + 2}">${UI.empty('Sin registros')}</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${U.fmtNum(all.length)} registros</span><span class="pager-btns"><button class="btn btn-sm btn-ghost" data-p="-1" ${st.page === 0 ? 'disabled' : ''}>‹</button><span>Página ${st.page + 1} de ${pages}</span><button class="btn btn-sm btn-ghost" data-p="1" ${st.page >= pages - 1 ? 'disabled' : ''}>›</button></span></div>`;
    U.$$('[data-p]', box).forEach((b) => b.onclick = () => { st.page += +b.dataset.p; drawTable(); });
    U.$$('tbody tr[data-id]', box).forEach(bindRow);
  }

  function bindRow(tr) {
    const def = DEFS[st.tab];
    const btn = tr.querySelector('[data-save]');
    if (!S.puedeEditar()) { tr.querySelectorAll('[data-k]').forEach((el) => { el.disabled = true; }); btn.hidden = true; return; }
    tr.querySelectorAll('[data-k]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => { btn.disabled = false; }));
    btn.onclick = async () => {
      if (!APP.requiereEdicion()) return;
      const row = { id: tr.dataset.id === 'new' ? null : +tr.dataset.id };
      tr.querySelectorAll('[data-k]').forEach((el) => {
        const c = def.cols.find((x) => x.k === el.dataset.k);
        let v = el.type === 'checkbox' ? el.checked : el.value.trim();
        if (c && c.num) v = v === '' ? null : Number(v);
        else if (c && c.date) v = U.iso(v);
        else if (typeof v === 'string') v = v === '' ? null : (c && c.k === 'descripcion' ? v : U.norm(v));
        row[el.dataset.k] = v;
      });
      if (st.tab === 'te' && row.tiempo_entrega && (row.dias_fin === null || row.dias_fin === undefined)) { const t = C.parseTiempoEntrega(row.tiempo_entrega); row.dias_inicio = t.ini; row.dias_fin = t.fin; if (t.tipo && !row.tipo_dias) row.tipo_dias = t.tipo; }
      const req = { te: ['proveedor', 'solicitante'], td: ['proveedor'], dnr: ['solicitante', 'dia'], inh: ['fecha'], listas: ['lista', 'valor'], cats: ['categoria', 'dias'] }[st.tab];
      const falt = req.filter((k) => U.blank(row[k]));
      if (falt.length) { UI.toast(`Falta: ${falt.join(', ')}`, 'warn'); return; }
      if (!row.id) delete row.id;
      btn.disabled = true; btn.textContent = '…';
      try { await S.saveCat(st.tab, row); UI.toast('Catálogo guardado'); drawTable(); }
      catch (e) { UI.toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar'; }
    };
  }

  APP.register('catalogos', {
    render(c) {
      root = c;
      c.innerHTML = `<section class="card"><div class="card-head"><h2>Catálogos</h2></div>
        <div class="seg">${Object.entries(DEFS).map(([k, d]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${U.esc(d.label)} <small>${S.cat[k].filter((r) => r.activo !== false).length}</small></button>`).join('')}</div>
        <div id="catBody"></div></section>`;
      U.$$('[data-tab]', c).forEach((b) => b.onclick = () => { st.tab = b.dataset.tab; st.q = ''; st.page = 0; APP.go(); });
      if (!S.cargado) return;
      draw();
    },
    refresh() { APP.go(); },
  });
})();
