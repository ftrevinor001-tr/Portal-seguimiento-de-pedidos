/* Vista: Seguimiento (tabla principal con filtros, KPIs, edición masiva y descarga) */
(function () {
  const st = { modulo: '', anio: '', mes: '', anio_est: '', mes_est: '', tipo_solicitud: '', comprador: '', area: '', solicitante: '', status: '', alerta: '', revision: '', q: '', bajas: false };
  let table = null, root = null;

  /** Columnas para exportar a Excel (campos + calculados) */
  APP.columnasExport = function (modulo) {
    const typeMap = { date: 'date', datetime: 'datetime', num: 'number', money: 'money', pct: 'pct' };
    const fields = modulo ? S.fieldsFor(modulo) : S.FIELDS;
    const cols = [
      { header: 'ID', key: 'id', type: 'number', width: 8 },
      { header: 'MÓDULO', value: (p) => C.MODULO_LABEL[p.modulo], width: 16 },
      ...fields.map((f) => ({ header: f.label.toUpperCase(), key: f.k, type: typeMap[f.type] || 'text', width: f.type === 'textarea' ? 40 : undefined, value: f.type === 'bool' ? (p) => p[f.k] ? 'SI' : 'NO' : undefined })),
      { header: 'ALERTA', key: '_alerta', width: 18 },
      { header: 'DÍAS DE INCUMPLIMIENTO', key: '_incumplimiento' },
      { header: 'DÍAS NATURALES', key: '_dias_naturales', type: 'number' },
      { header: 'DÍAS REALES DE ENTREGA', key: '_dias_entrega', type: 'number' },
      { header: 'EXISTENCIA', key: 'existencia', type: 'number' },
      { header: 'INV', key: '_inv' },
      { header: 'ESTATUS FACTURACIÓN (CALCULADO)', key: '_estatus_fact' },
      { header: 'CLASIFICACIÓN', key: '_clasificacion', width: 34 },
    ];
    if (!modulo || modulo === 'SOBREPEDIDO') cols.push({ header: '% PAGO MÍNIMO REQUERIDO', key: '_pct_minimo', type: 'pct' }, { header: 'CUMPLE POLÍTICA DE DOCUMENTACIÓN', key: '_cumple_politica' });
    cols.push({ header: 'CREADO POR', key: 'creado_por' }, { header: 'ÚLTIMA MODIFICACIÓN', key: 'actualizado_en', type: 'datetime' }, { header: 'MODIFICADO POR', key: 'actualizado_por' });
    return cols;
  };

  // Los tickets tienen su propia pestaña: aquí solo sobrepedido y entregas directas
  const SIN_TICKET = (p) => p.modulo !== 'TICKET';
  const MODULOS_SEG = C.MODULOS.filter((m) => m.value !== 'TICKET');
  function base() { return (st.bajas ? (S.bajas || []) : S.pedidos).filter(SIN_TICKET); }
  function filtrar() {
    const q = U.norm(st.q);
    return base().filter((p) => {
      if (st.modulo && p.modulo !== st.modulo) return false;
      if (st.anio || st.mes) { const m = C.mesSolicitud(p); if (!m) return false; if (st.anio && m.anio !== +st.anio) return false; if (st.mes && m.mes !== +st.mes) return false; }
      if (st.anio_est || st.mes_est) { const d = U.iso(p.fecha_estimada); if (!d) return false; if (st.anio_est && +d.slice(0, 4) !== +st.anio_est) return false; if (st.mes_est && +d.slice(5, 7) !== +st.mes_est) return false; }
      if (st.revision && C.inconsistencia(p) !== st.revision) return false;
      if (st.tipo_solicitud && p.tipo_solicitud !== st.tipo_solicitud) return false;
      if (st.comprador && p.comprador !== st.comprador) return false;
      if (st.area && p.area !== st.area) return false;
      if (st.solicitante && p.solicitante !== st.solicitante) return false;
      if (st.status && U.norm(p.status_pedido) !== st.status) return false;
      if (st.alerta && p._alerta !== st.alerta) return false;
      if (q) { const hay = U.norm(`${p.clave} ${p.folio_pedido} ${p.descripcion} ${p.id_oc} ${p.marca} ${p.folio_factura} ${p.comentarios}`); if (!q.split(' ').every((w) => hay.includes(w))) return false; }
      return true;
    });
  }

  const COLS = [
    { k: '_alerta', label: 'Alerta', render: (p) => UI.alerta(p._alerta), width: '130px' },
    { k: 'modulo', label: 'Tipo', render: (p) => `<span class="mod mod-${p.modulo}">${U.esc(p.tipo_solicitud || C.MODULO_LABEL[p.modulo])}</span>` },
    { k: 'folio_pedido', label: 'Folio', cls: 'nowrap' },
    { k: 'clave', label: 'Clave', cls: 'nowrap', sort: (p) => isNaN(p.clave) ? p.clave : Number(p.clave) },
    { k: 'descripcion', label: 'Descripción', cls: 'desc trunc', width: '260px' },
    { k: 'comprador', label: 'Comprador', cls: 'trunc', width: '140px' },
    { k: 'solicitante', label: 'Solicitante', cls: 'trunc', width: '130px' },
    { k: 'cantidad_solicitada', label: 'Cant.', cls: 'num', render: (p) => U.fmtNumAuto(p.cantidad_solicitada) },
    { k: 'fecha_solicitud', label: 'F. solicitud', cls: 'nowrap', render: (p) => U.fmtDate(p.fecha_solicitud) },
    { k: 'fecha_estimada', label: 'F. estimada', cls: 'nowrap', render: (p) => U.fmtDate(p.fecha_estimada) },
    { k: 'fecha_real_llegada', label: 'F. real', cls: 'nowrap', render: (p) => U.fmtDate(p.fecha_real_llegada) },
    { k: '_incumplimiento', label: 'Días incump.', cls: 'num', sort: (p) => typeof p._incumplimiento === 'number' ? p._incumplimiento : -1 },
    { k: 'status_pedido', label: 'Status', render: (p) => UI.status(p.status_pedido) },
    { k: '_estatus_fact', label: 'Facturación', render: (p) => UI.status(p._estatus_fact) },
    { k: 'existencia', label: 'Exist.', cls: 'num', render: (p) => U.fmtNumAuto(p.existencia) },
  ];

  function kpis(rows) {
    const r = C.resumenCumplimiento(rows);
    const cnt = (a) => rows.filter((p) => p._alerta === a).length;
    return `<div class="kpis">
      ${UI.kpi('Claves', U.fmtNum(rows.length), `${U.fmtNum(r.folios)} folios`)}
      ${UI.kpi('Pendientes', U.fmtNum(r.PEND_EN_PLAZO + r.PEND_VENCIDA), `${U.fmtNum(cnt('NOTIFICAR'))} por notificar`, 'kpi-warning')}
      ${UI.kpi('Fuera del plazo', U.fmtNum(cnt('FUERA DEL PLAZO')), `${U.fmtNum(r.PEND_VENCIDA)} sin llegar`, 'kpi-critical')}
      ${UI.kpi('Entregadas a tiempo', U.fmtPct(r.pctDentro), `${U.fmtNum(r.DENTRO)} de ${U.fmtNum(r.base)} medibles`, 'kpi-good')}
      ${UI.kpi('Días prom. de entrega', r.promDias === null ? '—' : U.fmtNum(r.promDias, 1), 'solicitud → llegada real')}
    </div>`;
  }

  function draw() {
    const rows = filtrar();
    U.$('#segKpis', root).innerHTML = kpis(rows);
    if (!table) {
      table = UI.table(U.$('#segTable', root), { cols: COLS, rows, selectable: S.puedeEditar(), onRow: (p) => APP.abrirDetalle(p.id), sortKey: 'fecha_solicitud', sortDir: -1, alto: true });
      table.onSelect = (sel) => { const b = U.$('#btnBulk', root); if (!b) return; b.disabled = !sel.size; b.textContent = sel.size ? `Editar ${sel.size} seleccionados` : 'Editar seleccionados'; };
    } else table.setRows(rows);
    table.onSelect(table.selected());
  }

  function filtros() {
    const mod = st.modulo || undefined;
    APP.filterBar(U.$('#segFilters', root), [
      { k: 'modulo', label: 'Módulo', options: () => MODULOS_SEG },
      { k: 'anio', label: 'Año (solicitud)', options: APP.anios },
      { k: 'mes', label: 'Mes (solicitud)', options: APP.mesesOpts },
      { k: 'anio_est', label: 'Año (f. estimada)', options: () => U.uniq(base().map((p) => U.iso(p.fecha_estimada) ? +U.iso(p.fecha_estimada).slice(0, 4) : null)).sort((a, b) => b - a) },
      { k: 'mes_est', label: 'Mes (f. estimada)', options: APP.mesesOpts },
      { k: 'tipo_solicitud', label: 'Tipo de solicitud', options: () => U.sortEs(U.uniq(base().filter((p) => !mod || p.modulo === mod).map((p) => p.tipo_solicitud))) },
      { k: 'comprador', label: 'Comprador', options: () => S.lista('COMPRADOR', mod) },
      { k: 'area', label: 'Área', options: () => S.lista('AREA', mod) },
      { k: 'solicitante', label: 'Solicitante', options: () => S.lista('SOLICITANTE', mod) },
      { k: 'status', label: 'Status', options: () => S.lista('STATUS', mod) },
      { k: 'alerta', label: 'Alerta', options: () => C.ALERTAS },
      { k: 'revision', label: 'Revisión', options: () => [{ value: 'STATUS_SIN_FECHA', label: 'Finalizado/entregado sin fecha real' }, { value: 'PENDIENTE_CON_FECHA', label: 'Pendiente con fecha real' }], wide: true },
      { k: 'q', label: 'Buscar', type: 'search', placeholder: 'Clave, folio, descripción, OC…' },
    ], st, (k) => { if (k === 'modulo') filtros(); draw(); }, {
      actions: `<button class="btn btn-ghost btn-sm" id="btnClear">Limpiar</button>`,
    });
    U.$('#btnClear', root).onclick = () => { Object.keys(st).forEach((k) => { st[k] = k === 'bajas' ? st.bajas : ''; }); filtros(); draw(); };
  }

  async function bulkEdit() {
    if (!APP.requiereEdicion('Para editar varias claves a la vez necesitas la contraseña.')) return;
    const ids = [...table.selected()];
    const rows = ids.map(S.byId).filter(Boolean);
    const mods = U.uniq(rows.map((p) => p.modulo));
    const keys = ['status_pedido', 'fecha_real_llegada', 'fecha_facturacion', 'estatus_facturacion', 'folio_factura', 'fecha_compromiso', 'comprador', 'resultado_final', 'comentarios'];
    const body = U.h(`<div><p class="muted">Solo se modifican los campos que marques. Aplica a <b>${ids.length}</b> claves de ${U.uniq(rows.map((p) => p.folio_pedido)).length} folio(s).</p>
      <div class="bulk">${keys.map((k) => { const f = S.FIELD[k]; return `<div class="bulk-row"><label class="chk"><input type="checkbox" data-use="${k}"></label>${UI.field(f, '', { modulo: mods.length === 1 ? mods[0] : undefined })}</div>`; }).join('')}</div></div>`);
    const m = UI.modal({ title: 'Editar claves seleccionadas', body, footer: '<button class="btn btn-ghost" data-a="c">Cancelar</button><button class="btn btn-primary" data-a="s">Aplicar cambios</button>' });
    U.$$('.bulk-row', m.el).forEach((row) => { const cb = U.$('[data-use]', row); U.$$('input:not([data-use]),select,textarea', row).forEach((inp) => inp.addEventListener('input', () => { cb.checked = true; })); });
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      const use = U.$$('[data-use]:checked', m.el).map((c) => c.dataset.use);
      if (!use.length) { UI.toast('Marca al menos un campo', 'warn'); return; }
      const patch = UI.readFields(m.el, use);
      if (!(await UI.confirm(`¿Aplicar ${use.length} cambio(s) a ${ids.length} claves?`))) return;
      const ld = UI.loading('Guardando…');
      try { await S.updateMany(ids, patch); UI.toast(`${ids.length} claves actualizadas`); m.close(); table.clearSelection(); draw(); }
      catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
    };
  }

  async function exportar() {
    const rows = filtrar();
    if (!rows.length) { UI.toast('No hay registros para descargar', 'warn'); return; }
    const ld = UI.loading('Generando Excel…');
    try {
      const sheets = st.modulo ? [{ name: C.MODULO_LABEL[st.modulo], columns: APP.columnasExport(st.modulo), rows }]
        : MODULOS_SEG.map((m) => ({ name: C.MODULO_LABEL[m.value], columns: APP.columnasExport(m.value), rows: rows.filter((p) => p.modulo === m.value) })).filter((s) => s.rows.length);
      await XL.exportar(sheets, `seguimiento_${S.hoy}.xlsx`);
    } finally { UI.loading(false); }
  }

  APP.register('seguimiento', {
    render(c) {
      root = c; table = null;
      c.classList.add('vista-fija');
      c.innerHTML = `
        <section class="card">
          <div class="card-head compacta"><h2>Seguimiento de pedidos <span class="muted small">· entregas directas y sobrepedido</span></h2>
            <div class="head-actions">
              <label class="chk"><input type="checkbox" id="chkBajas" ${st.bajas ? 'checked' : ''}> Ver dados de baja</label>
              ${S.puedeEditar() ? '<button class="btn btn-ghost" id="btnBulk" disabled>Editar seleccionados</button>' : ''}
              <button class="btn btn-ghost" id="btnXls">⭳ Descargar Excel</button>
              ${S.puedeEditar() ? '<button class="btn btn-primary" id="btnNuevo">＋ Nuevo pedido</button>' : '<button class="btn btn-primary" id="btnEntrarSeg">🔒 Entrar para editar</button>'}
            </div></div>
        </section>
        <section class="card card-filtros" id="segFiltrosCard"><div id="segFilters"></div></section>
        <div id="segKpis" class="kpis-slot"></div>
        <section class="card card-tabla"><div id="segTable"></div></section>`;
      filtros();
      if (!S.cargado) { U.$('#segTable', c).innerHTML = UI.empty('Cargando…'); return; }
      draw();
      const bNuevo = U.$('#btnNuevo', c); if (bNuevo) bNuevo.onclick = () => APP.nuevoPedido();
      const bEntrar = U.$('#btnEntrarSeg', c); if (bEntrar) bEntrar.onclick = () => APP.entrar();
      U.$('#btnXls', c).onclick = exportar;
      const bBulk = U.$('#btnBulk', c); if (bBulk) bBulk.onclick = bulkEdit;
      U.$('#chkBajas', c).onchange = async (e) => {
        st.bajas = e.target.checked;
        if (st.bajas && !S.bajas) { const ld = UI.loading('Cargando registros dados de baja…'); try { await S.loadBajas(); } catch (er) { UI.toast(er.message, 'error'); } finally { UI.loading(false); } }
        filtros(); draw();
      };
    },
    refresh() { if (root && document.body.contains(root) && table) { filtros(); draw(); } else APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'seguimiento' && table && document.body.contains(root)) draw(); });
})();
