/* Tickets por etapas — réplica del "REPORTE DE TICKETS" (v1.3.0) */
(function () {
  const st = { anio: '', mes: '', comprador: '', solicitante: '', categoria: '', etapa: '', estatus: '', alerta_cot: '', alerta_compra: '', desde: '', hasta: '', q: '' };
  let root = null, table = null;
  const CLS_ETAPA = { 'POR ASIGNAR': 'warning', 'EN COTIZACIÓN': 'info', 'ESPERA DEL USUARIO': 'info', 'POR RECOTIZAR': 'critical', 'POR PAGAR': 'warning', 'EN SURTIMIENTO': 'ok', ENTREGADO: 'ok', CANCELADO: 'muted' };
  const CLS_ALERTA = { 'EN TIEMPO': 'ok', 'POR VENCER': 'warning', 'VENCE HOY': 'warning', 'FUERA DEL PLAZO': 'critical', FINALIZADO: 'ok', 'SIN FECHA LIMITE': 'muted', 'SIN AUTORIZACION DE COMPRA': 'muted', 'SIN FECHA ESTIMADA': 'muted', CANCELADO: 'muted' };
  const badge = (v) => v ? `<span class="badge badge-${CLS_ALERTA[v] || 'muted'}">${U.esc(v)}</span>` : '';

  /** Un renglón por ticket (folio): las etapas son del folio completo */
  function tickets() {
    const grupos = U.groupBy(S.pedidos.filter((p) => p.modulo === 'TICKET'), (p) => U.norm(p.folio_pedido) || `SIN-FOLIO-${p.id}`);
    return [...grupos.entries()].map(([folio, claves]) => {
      const p = claves.find((x) => !C.cancelado(x)) || claves[0];
      const t = p._etapas || C.etapasTicket(p, S.hoy, S.hol, S.cat.cats);
      const ms = C.mesSolicitud(p);
      return {
        id: p.id, folio, p, claves, t, etapa: t.actual,
        anio: ms ? ms.anio : null, mes: ms ? ms.mes : null,
        comprador: p.comprador || '', solicitante: p.solicitante || '', categoria: p.categoria_ticket || '',
        descripcion: claves.map((x) => x.descripcion).filter(Boolean).join(' · '),
        fecha_solicitud: U.iso(p.fecha_solicitud),
        clave: U.uniq(claves.map((x) => x.clave)).join(', ') || 'NUEVO',
        estatus: p.status_pedido || '',
        f_sol: U.iso(p.fecha_solicitud), h_sol: (U.isoDateTime(p.fecha_solicitud) || '').slice(11, 16),
        f_asig: U.iso(p.fecha_asignacion), h_asig: (U.isoDateTime(p.fecha_asignacion) || '').slice(11, 16),
        f_cot: U.iso(p.fecha_cotizacion_usuario), f_aut: U.iso(p.fecha_autorizacion_compra),
        f_pago: U.iso(p.fecha_pago_proveedor), f_est: U.iso(p.fecha_estimada), f_fin: U.iso(p.fecha_real_llegada),
        horas: t.horasAsignacion, alerta_cot: t.alertaCotizacion, alerta_compra: t.alertaCompra,
        fuera: t.diasFuera, total: t.total, venceEn: t.venceEn, vigente: t.vigente, limite: t.limite,
      };
    });
  }

  function filtrar(rows) {
    const q = U.norm(st.q);
    return rows.filter((r) => {
      if (st.anio && String(r.anio) !== String(st.anio)) return false;
      if (st.mes && String(r.mes) !== String(st.mes)) return false;
      if (st.comprador && r.comprador !== st.comprador) return false;
      if (st.solicitante && r.solicitante !== st.solicitante) return false;
      if (st.categoria && r.categoria !== st.categoria) return false;
      if (st.etapa && r.etapa !== st.etapa) return false;
      if (st.estatus && U.norm(r.estatus) !== st.estatus) return false;
      if (st.desde && (!r.fecha_solicitud || r.fecha_solicitud < st.desde)) return false;
      if (st.hasta && (!r.fecha_solicitud || r.fecha_solicitud > st.hasta)) return false;
      if (st.alerta_cot && r.alerta_cot !== st.alerta_cot) return false;
      if (st.alerta_compra && r.alerta_compra !== st.alerta_compra) return false;
      if (q && !U.norm(`${r.folio} ${r.clave} ${r.descripcion} ${r.comprador} ${r.solicitante} ${r.categoria}`).includes(q)) return false;
      return true;
    });
  }

  const celda = (r, k) => {
    const e = r.t.etapas.find((x) => x.k === k);
    if (!e || e.dias === null) return e && e.estado === 'INACTIVA' ? '<span class="muted" title="Se activa si la cotización vence sin autorización">—</span>' : '<span class="muted">—</span>';
    const cls = e.estado === 'HECHA' ? (e.cumple ? 'dias-ok' : 'dias-mal') : (e.cumple ? 'dias-curso' : 'dias-tarde');
    const val = e.unidad === 'h' ? C.textoHoras(e.dias) : e.dias;
    const meta = e.unidad === 'h' ? `${e.meta} h` : `${e.meta} días hábiles`;
    return `<span class="dias ${cls}" title="${U.esc(e.label)}: ${e.estado.toLowerCase()} · meta ${meta}">${val}${e.estado === 'EN CURSO' ? '…' : ''}</span>`;
  };

  const COLS = [
    { k: 'folio', label: 'Ticket', cls: 'nowrap col-fija' },
    { k: 'clave', label: 'Clave', cls: 'nowrap' },
    { k: 'estatus', label: 'Estatus', render: (r) => UI.status(r.estatus) },
    { k: 'etapa', label: 'Etapa actual', width: '150px', render: (r) => `<span class="badge badge-${CLS_ETAPA[r.etapa] || 'muted'}">${U.esc(r.etapa)}</span>` },
    { k: 'solicitante', label: 'Solicitante', cls: 'trunc', width: '130px' },
    { k: 'comprador', label: 'Comprador', cls: 'trunc', width: '140px' },
    { k: 'descripcion', label: 'Descripción', cls: 'desc trunc', width: '260px' },
    { k: 'categoria', label: 'Categoría', cls: 'trunc', width: '150px' },
    { k: 'f_sol', label: 'F. solicitud', cls: 'nowrap', render: (r) => U.fmtDate(r.f_sol) },
    { k: 'h_sol', label: 'Hora solicitud', cls: 'nowrap' },
    { k: 'f_asig', label: 'F. asignación', cls: 'nowrap', render: (r) => U.fmtDate(r.f_asig) },
    { k: 'h_asig', label: 'Hora asignación', cls: 'nowrap' },
    { k: 'horas', label: 'Tiempo de asignación', cls: 'num', render: (r) => celda(r, 'asignacion'), sort: (r) => r.horas },
    { k: 'limite', label: 'F. límite cotiz.', cls: 'nowrap', render: (r) => U.fmtDate(r.limite) },
    { k: 'f_cot', label: 'F. entrega cotiz.', cls: 'nowrap', render: (r) => U.fmtDate(r.f_cot) },
    { k: 'd2', label: '2 Cotización', cls: 'num', render: (r) => celda(r, 'cotizacion'), sort: (r) => r.t.dias.cotizacion },
    { k: 'alerta_cot', label: 'Alerta cotización', width: '150px', render: (r) => badge(r.alerta_cot) },
    { k: 'd3', label: '3 Recot.', cls: 'num', render: (r) => celda(r, 'recotizacion'), sort: (r) => r.t.dias.recotizacion },
    { k: 'f_aut', label: 'F. autorización', cls: 'nowrap', render: (r) => U.fmtDate(r.f_aut) },
    { k: 'd4', label: '4 Autorización', cls: 'num', render: (r) => celda(r, 'autorizacion'), sort: (r) => r.t.dias.autorizacion },
    { k: 'f_pago', label: 'F. pago', cls: 'nowrap', render: (r) => U.fmtDate(r.f_pago) },
    { k: 'd5', label: '5 Pago', cls: 'num', render: (r) => celda(r, 'pago'), sort: (r) => r.t.dias.pago },
    { k: 'f_est', label: 'F. estimada llegada', cls: 'nowrap', render: (r) => U.fmtDate(r.f_est) },
    { k: 'f_fin', label: 'F. terminación', cls: 'nowrap', render: (r) => U.fmtDate(r.f_fin) },
    { k: 'd6', label: '6 Llegada', cls: 'num', render: (r) => celda(r, 'entrega'), sort: (r) => r.t.dias.entrega },
    { k: 'alerta_compra', label: 'Alerta compra', width: '160px', render: (r) => badge(r.alerta_compra) },
    { k: 'fuera', label: 'Días fuera de plazo', cls: 'num', render: (r) => r.fuera === null ? '' : (r.fuera > 0 ? `<b class="error">${r.fuera}</b>` : '0') },
    { k: 'venceEn', label: 'Vigencia cotización', cls: 'nowrap', render: (r) => r.venceEn === null ? '' : r.venceEn < 0 ? `<span class="badge badge-critical">Venció hace ${-r.venceEn} d</span>` : `${U.fmtDate(r.vigente)} · ${r.venceEn} d` },
    { k: 'total', label: 'Total (días háb.)', cls: 'num' },
  ];

  function kpis(rows) {
    const cnt = (e) => rows.filter((r) => r.etapa === e).length;
    const cotFuera = rows.filter((r) => r.alerta_cot === 'FUERA DEL PLAZO').length;
    const cotPorVencer = rows.filter((r) => ['POR VENCER', 'VENCE HOY'].includes(r.alerta_cot)).length;
    const compraFuera = rows.filter((r) => r.alerta_compra === 'FUERA DEL PLAZO').length;
    return `<div class="kpis">
      ${UI.kpi('Tickets', U.fmtNum(rows.length), `${U.fmtNum(U.sum(rows.map((r) => r.claves.length)))} renglones`)}
      ${UI.kpi('Por asignar', U.fmtNum(cnt('POR ASIGNAR')), 'esperan al jefe de área', cnt('POR ASIGNAR') ? 'kpi-warning' : '')}
      ${UI.kpi('Cotización fuera de plazo', U.fmtNum(cotFuera), `${U.fmtNum(cotPorVencer)} por vencer o vencen hoy`, cotFuera ? 'kpi-critical' : '')}
      ${UI.kpi('Por recotizar', U.fmtNum(cnt('POR RECOTIZAR')), 'venció sin autorización', cnt('POR RECOTIZAR') ? 'kpi-critical' : '')}
      ${UI.kpi('Compra fuera de plazo', U.fmtNum(compraFuera), `${U.fmtNum(cnt('EN SURTIMIENTO'))} en surtimiento`, compraFuera ? 'kpi-critical' : '')}
      ${UI.kpi('Entregados', U.fmtNum(cnt('ENTREGADO')), `${U.fmtNum(cnt('POR PAGAR'))} por pagar`, 'kpi-ok')}
    </div>`;
  }

  /** Promedio y cumplimiento de meta por etapa */
  function resumenEtapas(rows) {
    const filas = C.ETAPAS_TICKET.map((def) => {
      const es = rows.map((r) => r.t.etapas.find((x) => x.k === def.k)).filter((e) => e && e.estado === 'HECHA' && e.dias !== null);
      const curso = rows.filter((r) => { const e = r.t.etapas.find((x) => x.k === def.k); return e && e.estado === 'EN CURSO'; }).length;
      const vals = es.map((e) => e.dias);
      const dentro = es.filter((e) => e.cumple).length;
      const meta = es.length ? es[0].meta : (def.k === 'asignacion' ? C.METAS_TICKET().asignacion_horas : C.METAS_TICKET()[def.k]);
      return { def, n: es.length, curso, prom: vals.length ? U.sum(vals) / vals.length : null, max: vals.length ? Math.max(...vals) : null, pct: es.length ? dentro / es.length : null, meta };
    });
    const fmt = (def, v) => v === null ? '—' : def.unidad === 'h' ? `${C.textoHoras(v)} h` : `${v.toFixed ? v.toFixed(1) : v} d`;
    return `<section class="card"><div class="card-head"><h2>Tiempo por etapa</h2><p class="muted">La asignación se mide en horas (como el reporte); las demás etapas en días hábiles. Las metas se ajustan en <code>config.js</code> con <code>METAS_TICKET</code> y los días de cotización en Catálogos → Categorías de tickets.</p></div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Etapa</th><th>Se mide</th><th>Responsable</th><th class="num">Meta</th><th class="num">Tickets medidos</th><th class="num">Promedio</th><th class="num">Máximo</th><th class="num">Dentro de meta</th><th class="num">En curso</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td><b>${f.def.n}. ${U.esc(f.def.label)}</b></td><td class="muted">${U.esc(f.def.desc)}</td><td>${U.esc(f.def.quien)}</td>
        <td class="num">${f.meta}${f.def.unidad === 'h' ? ' h' : ' d'}</td><td class="num">${U.fmtNum(f.n)}</td>
        <td class="num"><b>${fmt(f.def, f.prom)}</b></td><td class="num">${fmt(f.def, f.max)}</td>
        <td class="num">${f.pct === null ? '—' : `<span class="badge badge-${f.pct >= 0.8 ? 'ok' : f.pct >= 0.5 ? 'warning' : 'critical'}">${U.fmtPct(f.pct, 0)}</span>`}</td>
        <td class="num">${U.fmtNum(f.curso)}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function flujo(rows) {
    const total = rows.length || 1;
    return `<section class="card"><div class="card-head"><h2>En qué etapa está cada ticket</h2></div>
      <div class="flujo flujo-7">${C.ETAPAS_FLUJO_TICKET.map((e) => {
        const n = rows.filter((r) => r.etapa === e).length;
        return `<button class="flujo-paso ${st.etapa === e ? 'on' : ''} fp-${CLS_ETAPA[e]}" data-etapa="${U.esc(e)}">
          <span class="fp-n">${U.fmtNum(n)}</span><span class="fp-lb">${U.esc(e)}</span><span class="fp-pct">${U.fmtPct(n / total, 0)}</span></button>`;
      }).join('')}</div>
      <p class="muted small">Da clic en una etapa para filtrar. Los tickets cancelados no aparecen en el flujo.</p></section>`;
  }

  function draw() {
    const rows = filtrar(tickets());
    const abierto = !U.$('#tkResumen', root).hidden;
    const cnt = (e) => rows.filter((r) => r.etapa === e).length;
    U.$('#tkResumenMini', root).textContent = `${U.fmtNum(rows.length)} tickets · ${U.fmtNum(cnt('POR ASIGNAR'))} por asignar · ${U.fmtNum(rows.filter((r) => r.alerta_cot === 'FUERA DEL PLAZO').length)} cotización fuera de plazo · ${U.fmtNum(cnt('ENTREGADO'))} entregados`;
    if (abierto) {
      U.$('#tkKpis', root).innerHTML = kpis(rows);
      U.$('#tkFlujo', root).innerHTML = flujo(rows);
      U.$$('[data-etapa]', root).forEach((b) => b.onclick = () => { st.etapa = st.etapa === b.dataset.etapa ? '' : b.dataset.etapa; filtros(); draw(); });
      U.$('#tkEtapas', root).innerHTML = resumenEtapas(rows);
    }
    table = UI.table(U.$('#tkTable', root), { cols: COLS, rows, sortKey: 'f_sol', sortDir: -1, onRow: (r) => APP.abrirDetalle(r.p.id), emptyMsg: 'No hay tickets con estos filtros.', alto: true, cls: 'lock-first' });
  }

  function filtros() {
    APP.filterBar(U.$('#tkFilters', root), [
      { k: 'anio', label: 'Año', options: APP.anios },
      { k: 'mes', label: 'Mes', options: APP.mesesOpts },
      { k: 'comprador', label: 'Comprador', options: () => S.lista('COMPRADOR', 'TICKET') },
      { k: 'solicitante', label: 'Solicitante', options: () => S.lista('SOLICITANTE', 'TICKET') },
      { k: 'categoria', label: 'Categoría', options: () => S.lista('CATEGORIA'), wide: true },
      { k: 'etapa', label: 'Etapa', options: () => C.ETAPAS_FLUJO_TICKET.concat(['CANCELADO']) },
      { k: 'estatus', label: 'Estatus', options: () => C.STATUS.TICKET },
      { k: 'alerta_cot', label: 'Alerta cotización', options: () => C.ALERTAS_TICKET },
      { k: 'alerta_compra', label: 'Alerta compra', options: () => C.ALERTAS_TICKET },
      { k: 'desde', label: 'Solicitud desde', type: 'date' },
      { k: 'hasta', label: 'Solicitud hasta', type: 'date' },
      { k: 'q', label: 'Buscar', type: 'search', placeholder: 'Ticket, clave, descripción, solicitante…', wide: true },
    ], st, () => draw(), { actions: '<button class="btn btn-ghost btn-sm" id="tkClear">Limpiar</button>' });
    U.$('#tkClear', root).onclick = () => { Object.keys(st).forEach((k) => st[k] = ''); filtros(); draw(); };
  }

  async function exportar() {
    const rows = filtrar(tickets());
    if (!rows.length) { UI.toast('No hay tickets para descargar', 'warn'); return; }
    const ld = UI.loading('Generando Excel…');
    try {
      const columns = [
        { header: 'AÑO', value: (r) => r.anio, type: 'number' }, { header: 'MES', value: (r) => r.p.mes || '' },
        { header: 'TICKET', value: (r) => r.folio }, { header: 'SOLICITANTE', value: (r) => r.solicitante },
        { header: 'CLAVE', value: (r) => r.claves.map((c) => c.clave).join(', ') },
        { header: 'DESCRIPCION', value: (r) => r.descripcion },
        { header: 'COMPRADOR', value: (r) => r.comprador }, { header: 'STATUS DEL TICKET', value: (r) => r.p.status_pedido || '' },
        { header: 'CATEGORIA', value: (r) => r.categoria },
        { header: 'FECHA DE SOLICITUD', value: (r) => r.fecha_solicitud, type: 'date' },
        { header: 'HORA DE SOLICITUD', value: (r) => (U.isoDateTime(r.p.fecha_solicitud) || '').slice(11, 16) },
        { header: 'FECHA ASIGNACION', value: (r) => U.iso(r.p.fecha_asignacion), type: 'date' },
        { header: 'HORA DE ASIGNACION', value: (r) => (U.isoDateTime(r.p.fecha_asignacion) || '').slice(11, 16) },
        { header: 'TIEMPO DE ASIGNACION (H)', value: (r) => r.horas === null ? '' : Number(r.horas.toFixed(2)), type: 'number' },
        { header: 'FECHA FINAL COTIZACION', value: (r) => r.limite, type: 'date' },
        { header: 'FECHA ENTREGA COTIZACION', value: (r) => U.iso(r.p.fecha_cotizacion_usuario), type: 'date' },
        { header: 'ALERTA COTIZACION', value: (r) => r.alerta_cot },
        { header: 'FECHA RECOTIZACION', value: (r) => U.iso(r.p.fecha_recotizacion_usuario), type: 'date' },
        { header: 'FECHA AUTORIZACION COMPRA', value: (r) => U.iso(r.p.fecha_autorizacion_compra), type: 'date' },
        { header: 'FECHA PAGO PROVEEDOR', value: (r) => U.iso(r.p.fecha_pago_proveedor), type: 'date' },
        { header: 'TIEMPO DE ENTREGA', value: (r) => r.p.tiempo_entrega || '' },
        { header: 'FECHA ESTIMADA DE LLEGADA', value: (r) => U.iso(r.p.fecha_estimada), type: 'date' },
        { header: 'FECHA REAL DE LLEGADA', value: (r) => U.iso(r.p.fecha_real_llegada), type: 'date' },
        { header: 'ALERTA COMPRA', value: (r) => r.alerta_compra },
        { header: 'COMENTARIOS', value: (r) => r.p.comentarios || '' },
        { header: 'VALIDACION TIEMPO', value: (r) => r.t.validacion },
        { header: 'DIAS FUERA DE PLAZO', value: (r) => r.fuera, type: 'number' },
        { header: 'DIAS 2 COTIZACION', value: (r) => r.t.dias.cotizacion, type: 'number' },
        { header: 'DIAS 4 AUTORIZACION', value: (r) => r.t.dias.autorizacion, type: 'number' },
        { header: 'DIAS 5 PAGO', value: (r) => r.t.dias.pago, type: 'number' },
        { header: 'DIAS 6 LLEGADA', value: (r) => r.t.dias.entrega, type: 'number' },
      ];
      await XL.exportar([{ name: 'Tickets', columns, rows }], `tickets_${S.hoy}.xlsx`);
    } finally { UI.loading(false); }
  }

  APP.register('tickets', {
    render(c) {
      root = c; table = null;
      c.classList.add('vista-fija');
      c.innerHTML = `<section class="card card-hero">
          <div class="card-head compacta"><h2>Tickets por etapa</h2>
            <div class="head-actions"><button class="btn btn-ghost btn-sm" id="tkXls">⭳ Descargar Excel</button>${S.puedeEditar() ? '<button class="btn btn-primary btn-sm" id="tkNuevo">＋ Nuevo ticket</button>' : ''}</div>
          </div>
        </section>
        <section class="card card-filtros" id="tkFiltrosCard"><div id="tkFilters"></div></section>
        <section class="card card-resumen"><div class="resumen-toggle"><b>Resumen</b><span class="muted small" id="tkResumenMini"></span><button class="btn btn-light btn-sm" id="tkVerResumen">Ver resumen ▾</button></div>
          <div id="tkResumen" hidden>
            <p class="muted small">Etapas: <b>1 Asignación</b> (horas del jefe de área) · <b>2 Cotización</b> (contra la fecha límite de la categoría) · <b>3 Recotización</b> (si vence sin autorización) · <b>4 Autorización</b> del usuario · <b>5 Pago</b> al proveedor · <b>6 Llegada</b> a SANVER. Las fechas se capturan en el detalle de cualquier renglón del ticket.</p>
            <div id="tkKpis"></div><div id="tkFlujo"></div><div id="tkEtapas"></div></div>
        </section>
        <section class="card card-tabla"><div id="tkTable"></div></section>`;
      if (!S.cargado) { U.$('#tkTable', c).innerHTML = UI.empty('Cargando…'); return; }
      filtros();
      let abierto = false;
      try { abierto = localStorage.getItem('sp_tk_resumen') === '1'; } catch { /* sin storage */ }
      const pintarResumen = () => {
        U.$('#tkResumen', c).hidden = !abierto;
        U.$('#tkVerResumen', c).textContent = abierto ? 'Ocultar resumen ▴' : 'Ver resumen ▾';
        setTimeout(APP.medirTop, 30);
      };
      U.$('#tkVerResumen', c).onclick = () => {
        abierto = !abierto;
        try { localStorage.setItem('sp_tk_resumen', abierto ? '1' : '0'); } catch { /* sin storage */ }
        pintarResumen(); draw();
      };
      pintarResumen();
      draw();
      U.$('#tkXls', c).onclick = exportar;
      const nuevo = U.$('#tkNuevo', c); if (nuevo) nuevo.onclick = () => APP.nuevoPedido('TICKET');
    },
    refresh() { if (root && document.body.contains(root)) { filtros(); draw(); } else APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'tickets' && root && document.body.contains(root)) draw(); });
})();
