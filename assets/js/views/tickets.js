/* Tickets por etapas: asignación, cotización, recotización y entrega (v1.2.0) */
(function () {
  const st = { anio: '', mes: '', comprador: '', area: '', solicitante: '', etapa: '', q: '' };
  let root = null, table = null;
  const ETAPAS_FLUJO = ['POR ASIGNAR', 'EN COTIZACIÓN', 'ESPERA DEL USUARIO', 'POR RECOTIZAR', 'EN SURTIMIENTO', 'ENTREGADO'];
  const CLS_ETAPA = { 'POR ASIGNAR': 'warning', 'EN COTIZACIÓN': 'info', 'ESPERA DEL USUARIO': 'info', 'POR RECOTIZAR': 'critical', 'EN SURTIMIENTO': 'ok', ENTREGADO: 'ok', CANCELADO: 'muted' };

  /** Un renglón por ticket (folio): las etapas son del folio completo */
  function tickets() {
    const grupos = U.groupBy(S.pedidos.filter((p) => p.modulo === 'TICKET'), (p) => U.norm(p.folio_pedido) || `SIN-FOLIO-${p.id}`);
    return [...grupos.entries()].map(([folio, claves]) => {
      const p = claves.find((x) => !C.cancelado(x)) || claves[0];
      const t = p._etapas || C.etapasTicket(p, S.hoy, S.hol);
      const ms = C.mesSolicitud(p);
      return {
        id: p.id, folio, p, claves, t, etapa: t.actual,
        anio: ms ? ms.anio : null, mes: ms ? ms.mes : null,
        comprador: p.comprador || '', area: p.area || '', solicitante: p.solicitante || '',
        descripcion: claves.map((x) => x.descripcion).filter(Boolean).join(' · '),
        fecha_solicitud: U.iso(p.fecha_solicitud),
        d1: t.dias.asignacion, d2: t.dias.cotizacion, d3: t.dias.recotizacion, d4: t.dias.entrega,
        total: t.total, venceEn: t.venceEn, vigente: t.vigente,
      };
    });
  }

  function filtrar(rows) {
    const q = U.norm(st.q);
    return rows.filter((r) => {
      if (st.anio && String(r.anio) !== String(st.anio)) return false;
      if (st.mes && String(r.mes) !== String(st.mes)) return false;
      if (st.comprador && r.comprador !== st.comprador) return false;
      if (st.area && r.area !== st.area) return false;
      if (st.solicitante && r.solicitante !== st.solicitante) return false;
      if (st.etapa && r.etapa !== st.etapa) return false;
      if (q && !U.norm(`${r.folio} ${r.descripcion} ${r.comprador} ${r.solicitante} ${r.area}`).includes(q)) return false;
      return true;
    });
  }

  const celdaDias = (r, k) => {
    const e = r.t.etapas.find((x) => x.k === k);
    if (!e || e.dias === null) return e && e.estado === 'INACTIVA' ? '<span class="muted" title="Se activa si la cotización vence sin respuesta">—</span>' : '<span class="muted">—</span>';
    const cls = e.estado === 'HECHA' ? (e.cumple ? 'dias-ok' : 'dias-mal') : (e.cumple ? 'dias-curso' : 'dias-tarde');
    return `<span class="dias ${cls}" title="${U.esc(e.label)}: ${e.estado.toLowerCase()} · meta ${e.meta} días hábiles">${e.dias}${e.estado === 'EN CURSO' ? '…' : ''}</span>`;
  };

  const COLS = [
    { k: 'folio', label: 'Folio del ticket', cls: 'nowrap' },
    { k: 'fecha_solicitud', label: 'Levantado', cls: 'nowrap', render: (r) => U.fmtDate(r.fecha_solicitud) },
    { k: 'nClaves', label: 'Claves', cls: 'num', render: (r) => r.claves.length, sort: (r) => r.claves.length },
    { k: 'solicitante', label: 'Solicitante' },
    { k: 'comprador', label: 'Comprador' },
    { k: 'etapa', label: 'Etapa actual', width: '160px', render: (r) => `<span class="badge badge-${CLS_ETAPA[r.etapa] || 'muted'}">${U.esc(r.etapa)}</span>` },
    { k: 'd1', label: '1 Asignación', cls: 'num', render: (r) => celdaDias(r, 'asignacion') },
    { k: 'd2', label: '2 Cotización', cls: 'num', render: (r) => celdaDias(r, 'cotizacion') },
    { k: 'd3', label: '3 Recotización', cls: 'num', render: (r) => celdaDias(r, 'recotizacion') },
    { k: 'd4', label: '4 Entrega', cls: 'num', render: (r) => celdaDias(r, 'entrega') },
    { k: 'venceEn', label: 'Vigencia', cls: 'nowrap', render: (r) => r.venceEn === null ? '' : r.venceEn < 0 ? `<span class="badge badge-critical">Venció hace ${-r.venceEn} d</span>` : `${U.fmtDate(r.vigente)} · ${r.venceEn} d` },
    { k: 'total', label: 'Total (días háb.)', cls: 'num' },
  ];

  function kpis(rows) {
    const cnt = (e) => rows.filter((r) => r.etapa === e).length;
    const porVencer = rows.filter((r) => r.venceEn !== null && r.venceEn >= 0 && r.venceEn <= C.METAS_TICKET().avisar_vence).length;
    return `<div class="kpis">
      ${UI.kpi('Tickets', U.fmtNum(rows.length), `${U.fmtNum(U.sum(rows.map((r) => r.claves.length)))} claves`)}
      ${UI.kpi('Por asignar', U.fmtNum(cnt('POR ASIGNAR')), 'esperan al jefe de área', cnt('POR ASIGNAR') ? 'kpi-warning' : '')}
      ${UI.kpi('En cotización', U.fmtNum(cnt('EN COTIZACIÓN')), 'con el comprador')}
      ${UI.kpi('Por recotizar', U.fmtNum(cnt('POR RECOTIZAR')), 'venció sin respuesta', cnt('POR RECOTIZAR') ? 'kpi-critical' : '')}
      ${UI.kpi('Cotizaciones por vencer', U.fmtNum(porVencer), `en ${C.METAS_TICKET().avisar_vence} días o menos`, porVencer ? 'kpi-warning' : '')}
      ${UI.kpi('Entregados', U.fmtNum(cnt('ENTREGADO')), `${U.fmtNum(cnt('EN SURTIMIENTO'))} en surtimiento`, 'kpi-ok')}
    </div>`;
  }

  /** Promedio y cumplimiento de meta por etapa */
  function resumenEtapas(rows) {
    const filas = C.ETAPAS_TICKET.map((def) => {
      const es = rows.map((r) => r.t.etapas.find((x) => x.k === def.k)).filter((e) => e && e.estado === 'HECHA' && e.dias !== null);
      const curso = rows.filter((r) => { const e = r.t.etapas.find((x) => x.k === def.k); return e && e.estado === 'EN CURSO'; }).length;
      const dias = es.map((e) => e.dias);
      const dentro = es.filter((e) => e.cumple).length;
      return { def, n: es.length, curso, prom: dias.length ? U.sum(dias) / dias.length : null, max: dias.length ? Math.max(...dias) : null, pct: es.length ? dentro / es.length : null, meta: C.METAS_TICKET()[def.k] };
    });
    return `<section class="card"><div class="card-head"><h2>Tiempo por etapa</h2><p class="muted">Días hábiles (L-V, sin días inhábiles). La meta se ajusta en <code>config.js</code> con <code>METAS_TICKET</code>.</p></div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Etapa</th><th>Se mide</th><th>Responsable</th><th class="num">Meta</th><th class="num">Tickets medidos</th><th class="num">Promedio</th><th class="num">Máximo</th><th class="num">Dentro de meta</th><th class="num">En curso</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td><b>${f.def.n}. ${U.esc(f.def.label)}</b></td><td class="muted">${U.esc(f.def.desc)}</td><td>${U.esc(f.def.quien)}</td>
        <td class="num">${f.meta} d</td><td class="num">${U.fmtNum(f.n)}</td>
        <td class="num">${f.prom === null ? '—' : `<b>${f.prom.toFixed(1)}</b> d`}</td>
        <td class="num">${f.max === null ? '—' : `${f.max} d`}</td>
        <td class="num">${f.pct === null ? '—' : `<span class="badge badge-${f.pct >= 0.8 ? 'ok' : f.pct >= 0.5 ? 'warning' : 'critical'}">${U.fmtPct(f.pct, 0)}</span>`}</td>
        <td class="num">${U.fmtNum(f.curso)}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function flujo(rows) {
    const total = rows.length || 1;
    return `<section class="card"><div class="card-head"><h2>En qué etapa está cada ticket</h2></div>
      <div class="flujo">${ETAPAS_FLUJO.map((e) => {
        const n = rows.filter((r) => r.etapa === e).length;
        return `<button class="flujo-paso ${st.etapa === e ? 'on' : ''} fp-${CLS_ETAPA[e]}" data-etapa="${U.esc(e)}">
          <span class="fp-n">${U.fmtNum(n)}</span><span class="fp-lb">${U.esc(e)}</span><span class="fp-pct">${U.fmtPct(n / total, 0)}</span></button>`;
      }).join('')}</div>
      <p class="muted small">Da clic en una etapa para filtrar. Los tickets cancelados no aparecen en el flujo.</p></section>`;
  }

  function draw() {
    const rows = filtrar(tickets());
    U.$('#tkKpis', root).innerHTML = kpis(rows);
    U.$('#tkFlujo', root).innerHTML = flujo(rows);
    U.$$('[data-etapa]', root).forEach((b) => b.onclick = () => { st.etapa = st.etapa === b.dataset.etapa ? '' : b.dataset.etapa; filtros(); draw(); });
    U.$('#tkEtapas', root).innerHTML = resumenEtapas(rows);
    table = UI.table(U.$('#tkTable', root), { cols: COLS, rows, sortKey: 'fecha_solicitud', sortDir: -1, onRow: (r) => APP.abrirDetalle(r.p.id), emptyMsg: 'No hay tickets con estos filtros.' });
  }

  function filtros() {
    APP.filterBar(U.$('#tkFilters', root), [
      { k: 'anio', label: 'Año', options: APP.anios },
      { k: 'mes', label: 'Mes', options: APP.mesesOpts },
      { k: 'comprador', label: 'Comprador', options: () => S.lista('COMPRADOR', 'TICKET') },
      { k: 'area', label: 'Área', options: () => S.lista('AREA', 'TICKET') },
      { k: 'solicitante', label: 'Solicitante', options: () => S.lista('SOLICITANTE', 'TICKET') },
      { k: 'etapa', label: 'Etapa', options: () => ETAPAS_FLUJO.concat(['CANCELADO']) },
      { k: 'q', label: 'Buscar', type: 'search', placeholder: 'Folio, descripción, solicitante…', wide: true },
    ], st, () => draw(), { actions: '<button class="btn btn-ghost btn-sm" id="tkClear">Limpiar</button>' });
    U.$('#tkClear', root).onclick = () => { Object.keys(st).forEach((k) => st[k] = ''); filtros(); draw(); };
  }

  async function exportar() {
    const rows = filtrar(tickets());
    if (!rows.length) { UI.toast('No hay tickets para descargar', 'warn'); return; }
    const ld = UI.loading('Generando Excel…');
    try {
      const columns = [
        { header: 'FOLIO', value: (r) => r.folio }, { header: 'LEVANTADO', value: (r) => r.fecha_solicitud, type: 'date' },
        { header: 'CLAVES', value: (r) => r.claves.length, type: 'number' },
        { header: 'SOLICITANTE', value: (r) => r.solicitante }, { header: 'AREA', value: (r) => r.area }, { header: 'COMPRADOR', value: (r) => r.comprador },
        { header: 'ETAPA ACTUAL', value: (r) => r.etapa },
        { header: 'F. ASIGNACION', value: (r) => U.iso(r.p.fecha_asignacion), type: 'date' },
        { header: 'ASIGNADO POR', value: (r) => r.p.asignado_por || '' },
        { header: 'F. COTIZACION AL USUARIO', value: (r) => U.iso(r.p.fecha_cotizacion_usuario), type: 'date' },
        { header: 'VENCE COTIZACION', value: (r) => r.t.vence, type: 'date' },
        { header: 'F. RECOTIZACION', value: (r) => U.iso(r.p.fecha_recotizacion_usuario), type: 'date' },
        { header: 'VENCE RECOTIZACION', value: (r) => r.t.vence2, type: 'date' },
        { header: 'F. ACEPTACION USUARIO', value: (r) => U.iso(r.p.fecha_aceptacion_usuario), type: 'date' },
        { header: 'F. LLEGADA A SANVER', value: (r) => U.iso(r.p.fecha_real_llegada), type: 'date' },
        { header: 'DIAS 1 ASIGNACION', value: (r) => r.d1, type: 'number' },
        { header: 'DIAS 2 COTIZACION', value: (r) => r.d2, type: 'number' },
        { header: 'DIAS 3 RECOTIZACION', value: (r) => r.d3, type: 'number' },
        { header: 'DIAS 4 ENTREGA', value: (r) => r.d4, type: 'number' },
        { header: 'DIAS TOTALES (HABILES)', value: (r) => r.total, type: 'number' },
        { header: 'NOTA', value: (r) => r.p.nota_etapas || '' },
      ];
      await XL.exportar([{ name: 'Tickets por etapa', columns, rows }], `tickets_etapas_${S.hoy}.xlsx`);
    } finally { UI.loading(false); }
  }

  APP.register('tickets', {
    render(c) {
      root = c; table = null;
      c.innerHTML = `<section class="card card-hero">
          <div class="card-head"><h2>Tickets por etapa</h2>
            <div class="head-actions"><button class="btn btn-ghost" id="tkXls">⭳ Descargar Excel</button>${S.puedeEditar() ? '<button class="btn btn-primary" id="tkNuevo">＋ Nuevo ticket</button>' : ''}</div>
          </div>
          <p class="muted">Cada ticket se mide en cuatro etapas: <b>1 Asignación</b> (jefe de área), <b>2 Cotización</b> (comprador → respuesta al usuario), <b>3 Recotización</b> (solo si la cotización vence sin respuesta) y <b>4 Entrega</b> (de la aceptación a la llegada a SANVER). Las fechas se capturan en el detalle de cualquier clave del ticket.</p>
          <div id="tkFilters"></div>
        </section>
        <div id="tkKpis"></div>
        <div id="tkFlujo"></div>
        <div id="tkEtapas"></div>
        <section class="card"><div class="card-head"><h2>Tickets</h2><p class="muted">Da clic en un ticket para capturar sus fechas.</p></div><div id="tkTable"></div></section>`;
      if (!S.cargado) { U.$('#tkTable', c).innerHTML = UI.empty('Cargando…'); return; }
      filtros(); draw();
      U.$('#tkXls', c).onclick = exportar;
      const nuevo = U.$('#tkNuevo', c); if (nuevo) nuevo.onclick = () => APP.nuevoPedido('TICKET');
    },
    refresh() { if (root && document.body.contains(root)) { filtros(); draw(); } else APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'tickets' && root && document.body.contains(root)) draw(); });
})();
