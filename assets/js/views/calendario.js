/* Vista: Calendario operativo de Entregas Directas (carga de descarga por día) */
(function () {
  const st = { anio: '', mes: '', solicitante: '', dia: null };
  let root = null;
  const NIVEL = { SIN: { label: 'Sin carga', cls: 'lvl-sin' }, BAJA: { label: 'Baja', cls: 'lvl-baja' }, MEDIA: { label: 'Media', cls: 'lvl-media' }, ALTA: { label: 'Alta', cls: 'lvl-alta' } };

  function datosMes() {
    const y = +st.anio, mth = +st.mes;
    const ed = S.pedidos.filter((p) => p.modulo === 'ENTREGA_DIRECTA' && (!st.solicitante || p.solicitante === st.solicitante));
    const mesRows = ed.filter((p) => C.traslapaMes(p, y, mth));
    return { y, mth, mesRows };
  }
  /** Claves programadas para el día: ventana [inicio, fin] contiene el día, no canceladas y sin fecha real */
  function delDia(rows, iso) {
    return rows.filter((p) => { const v = C.ventana(p); return v.ini <= iso && v.fin >= iso && !C.cancelado(p) && !U.iso(p.fecha_real_llegada); });
  }
  function resumenDia(rows) {
    const horas = C.horasFolios(rows);
    return { folios: horas.size, prov: new Set(rows.map(C.proveedorDe)).size, horas: U.sum([...horas.values()]), rows };
  }

  function draw() {
    const { y, mth, mesRows } = datosMes();
    const noRecibe = st.solicitante ? S.diaNoRecibe(st.solicitante) : [];
    // KPIs del mes
    const horasMes = C.horasFolios(mesRows);
    const noCanc = mesRows.filter((p) => !C.cancelado(p));
    const entregadas = noCanc.filter((p) => U.iso(p.fecha_real_llegada)).length;
    U.$('#calKpis', root).innerHTML = `<div class="kpis kpis-2">
      ${UI.kpi('Folios programados', U.fmtNum(horasMes.size))}
      ${UI.kpi('Proveedores', U.fmtNum(new Set(noCanc.map(C.proveedorDe)).size))}
      ${UI.kpi('Horas estimadas del mes', `${U.fmtNumAuto(U.sum([...horasMes.values()]))} h`)}
      ${UI.kpi('% de entregas', U.fmtPct(noCanc.length ? entregadas / noCanc.length : null), `${U.fmtNum(entregadas)} de ${U.fmtNum(noCanc.length)} claves`)}
    </div>`;
    // Calendario L-S
    const first = U.monthStart(y, mth), days = U.daysInMonth(y, mth);
    const cells = [];
    let offset = (U.weekday(first) + 6) % 7; // lunes = 0
    if (offset === 6) offset = 0; // mes que inicia en domingo
    for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell cal-empty"></div>');
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(mth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const wd = U.weekday(iso);
      if (wd === 0) continue;
      const r = resumenDia(delDia(mesRows, iso));
      const lvl = C.nivelCarga(r.horas);
      const inh = S.hol.has(iso);
      const nr = noRecibe.includes(U.DIAS_SEMANA[wd]);
      cells.push(`<button class="cal-cell ${NIVEL[lvl].cls} ${nr ? 'lvl-norecibe' : ''} ${st.dia === iso ? 'sel' : ''} ${iso === S.hoy ? 'today' : ''}" data-d="${iso}" aria-label="${d} de ${U.MESES[mth - 1].toLowerCase()}: ${r.folios} folios, ${r.horas} horas, carga ${NIVEL[lvl].label}">
        <div class="cal-top"><span class="cal-n">${String(d).padStart(2, '0')}</span><span class="cal-badge">${nr ? 'No recibe' : inh ? 'Inhábil' : NIVEL[lvl].label}</span></div>
        <div class="cal-l"><b>Folios:</b> ${r.folios}</div><div class="cal-l"><b>Prov:</b> ${r.prov}</div><div class="cal-l"><b>Horas:</b> ${U.fmtNumAuto(r.horas)}</div></button>`);
    }
    U.$('#calGrid', root).innerHTML = `<div class="cal-head">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-body">${cells.join('')}</div>
      <div class="legend"><span><i class="sw lvl-sin"></i>Sin carga</span><span><i class="sw lvl-baja"></i>Carga baja (&lt; ${Math.round((SP_CONFIG.UMBRAL_CARGA_MEDIA ?? 0.5) * (SP_CONFIG.CAPACIDAD_HORAS_DIA || 8))} h)</span><span><i class="sw lvl-media"></i>Carga media</span><span><i class="sw lvl-alta"></i>Carga alta (≥ ${SP_CONFIG.CAPACIDAD_HORAS_DIA || 8} h)</span><span><i class="sw lvl-norecibe"></i>No recibe entrega directa</span></div>`;
    U.$$('.cal-cell[data-d]', root).forEach((b) => b.onclick = () => { st.dia = b.dataset.d; draw(); });
    detalle(mesRows);
  }

  function detalle(mesRows) {
    const box = U.$('#calDetail', root);
    if (!st.dia) { box.innerHTML = `<h3>Detalle del día</h3>${UI.empty('Selecciona un día del calendario.')}`; return; }
    const r = resumenDia(delDia(mesRows, st.dia));
    const lvl = C.nivelCarga(r.horas);
    const porMarca = U.groupBy(r.rows, C.proveedorDe);
    const marcas = [...porMarca.entries()].map(([marca, rows]) => { const h = C.horasFolios(rows); return { marca, rows, folios: h.size, horas: U.sum([...h.values()]) }; }).sort((a, b) => b.horas - a.horas || b.folios - a.folios);
    box.innerHTML = `<h3>Detalle del día</h3>
      <div class="day-kpis ${NIVEL[lvl].cls}"><div class="day-kpis-head"><b>${U.fmtDate(st.dia)}</b><span class="cal-badge">Carga ${NIVEL[lvl].label.toLowerCase()}</span></div>
        <div class="kpis kpis-2">${UI.kpi('Folios', r.folios)}${UI.kpi('Proveedores', r.prov)}${UI.kpi('Horas', `${U.fmtNumAuto(r.horas)} h`)}${UI.kpi('Claves', r.rows.length)}</div></div>
      ${marcas.length ? `<h4>Marcas principales</h4><div class="mini-list">${marcas.slice(0, 6).map((m) => `<div class="mini-row"><div><b>${U.esc(m.marca)}</b><small>${m.folios} folio(s)</small></div><b>${U.fmtNumAuto(m.horas)} h</b></div>`).join('')}</div>
      <h4>Detalle agrupado por marca</h4>${marcas.map((m) => `<details class="grp" open><summary><span><b>${U.esc(m.marca)}</b><small>${m.folios} folio(s) · ${m.rows.length} registro(s)</small></span><b>${U.fmtNumAuto(m.horas)} h</b></summary>
        ${m.rows.map((p) => `<div class="line clickable" data-id="${p.id}"><div class="line-top"><b>${U.esc(p.folio_pedido || '')}</b>${UI.status(p.status_pedido)}</div><div class="muted">${U.esc(p.clave || '')} · ${U.esc(p.solicitante || '')}</div><div>${U.esc(p.descripcion || '')}</div><small>Cantidad: ${U.fmtNumAuto(p.cantidad_solicitada)} · Horas folio: ${U.fmtNumAuto(p.tiempo_descarga_horas)} · Ventana ${U.fmtDate(C.ventana(p).ini)}–${U.fmtDate(C.ventana(p).fin)}</small></div>`).join('')}
      </details>`).join('')}` : UI.empty('Sin folios pendientes de llegar este día.')}`;
    U.$$('.line[data-id]', box).forEach((el) => el.onclick = () => APP.abrirDetalle(+el.dataset.id));
  }

  function filtros() {
    APP.filterBar(U.$('#calFilters', root), [
      { k: 'anio', label: 'Año', options: APP.anios, empty: null },
      { k: 'mes', label: 'Mes', options: APP.mesesOpts, empty: null },
      { k: 'solicitante', label: 'Solicitante', options: () => S.lista('SOLICITANTE', 'ENTREGA_DIRECTA'), wide: true },
    ], st, () => { st.dia = null; draw(); });
  }

  APP.register('calendario', {
    render(c) {
      root = c;
      if (!st.anio) { st.anio = S.hoy.slice(0, 4); st.mes = String(+S.hoy.slice(5, 7)); }
      c.innerHTML = `<section class="card card-hero"><div class="card-head"><h2>Entregas Directas · Calendario operativo</h2><p class="muted">Folios pendientes de llegar por día (ventana de fecha estimada inicio–fin). Las horas son el tiempo de descarga por folio.</p></div><div id="calFilters"></div></section>
        <div class="cal-layout"><section class="card"><div id="calGrid"></div></section><aside class="cal-side"><div id="calKpis"></div><section class="card" id="calDetail"></section></aside></div>`;
      if (!S.cargado) return;
      filtros();
      if (!st.dia && S.hoy.slice(0, 7) === `${st.anio}-${String(st.mes).padStart(2, '0')}`) st.dia = S.hoy;
      draw();
    },
    refresh() { APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'calendario' && root && document.body.contains(root)) draw(); });
})();
