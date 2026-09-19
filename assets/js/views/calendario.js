/* Vista: Calendario operativo de Entregas Directas (carga de descarga por día) */
(function () {
  const st = { anio: '', mes: '', solicitante: '', ver: '', dia: null };
  let root = null;
  const NIVEL = { SIN: { label: 'Sin carga', cls: 'lvl-sin' }, BAJA: { label: 'Baja', cls: 'lvl-baja' }, MEDIA: { label: 'Media', cls: 'lvl-media' }, ALTA: { label: 'Alta', cls: 'lvl-alta' } };

  function datosMes() {
    const y = +st.anio, mth = +st.mes;
    const ed = S.pedidos.filter((p) => p.modulo === 'ENTREGA_DIRECTA' && (!st.solicitante || p.solicitante === st.solicitante));
    const mesRows = ed.filter((p) => C.llegaEnMes(p, y, mth));
    return { y, mth, ed, mesRows };
  }
  /** Claves programadas para el día: su fecha estimada de llegada es ese día, no canceladas y sin fecha real */
  function delDia(rows, iso) {
    return rows.filter((p) => C.llegaEnDia(p, iso));
  }
  /** Atrasadas: su fecha estimada ya pasó y siguen sin fecha real de llegada */
  const atrasadas = (rows) => rows.filter((p) => U.iso(p.fecha_estimada) < S.hoy);
  function resumenDia(rows) {
    const horas = C.horasFolios(rows);
    const atr = atrasadas(rows);
    return { folios: horas.size, prov: new Set(rows.map(C.proveedorDe)).size, horas: U.sum([...horas.values()]), rows, atrasadas: atr.length, foliosAtrasados: C.horasFolios(atr).size };
  }

  function draw() {
    const { y, mth, ed, mesRows } = datosMes();
    const noRecibe = st.solicitante ? S.diaNoRecibe(st.solicitante) : [];
    // KPIs del mes
    const horasMes = C.horasFolios(mesRows);
    const noCanc = mesRows.filter((p) => !C.cancelado(p));
    const entregadas = noCanc.filter((p) => U.iso(p.fecha_real_llegada)).length;
    const pendientes = noCanc.filter((p) => !U.iso(p.fecha_real_llegada));
    const atrMes = atrasadas(pendientes);
    const atrAntes = ed.filter((p) => !C.cancelado(p) && !U.iso(p.fecha_real_llegada) && U.iso(p.fecha_estimada) && U.iso(p.fecha_estimada) < U.monthStart(y, mth));
    U.$('#calKpis', root).innerHTML = `<div class="kpis kpis-2">
      ${UI.kpi('Folios programados', U.fmtNum(horasMes.size))}
      ${UI.kpi('Proveedores', U.fmtNum(new Set(noCanc.map(C.proveedorDe)).size))}
      ${UI.kpi('Horas estimadas del mes', `${U.fmtNumAuto(U.sum([...horasMes.values()]))} h`)}
      ${UI.kpi('% de entregas', U.fmtPct(noCanc.length ? entregadas / noCanc.length : null), `${U.fmtNum(entregadas)} de ${U.fmtNum(noCanc.length)} claves`)}
      ${UI.kpi('Atrasadas del mes', U.fmtNum(atrMes.length), `${U.fmtNum(C.horasFolios(atrMes).size)} folio(s) sin fecha real`, atrMes.length ? 'kpi-critical' : '')}
      ${UI.kpi('Atrasadas de meses anteriores', U.fmtNum(atrAntes.length), atrAntes.length ? 'siguen pendientes' : 'nada pendiente', atrAntes.length ? 'kpi-warning' : '')}
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
      if (st.ver === 'ATRASO' && !r.atrasadas) { cells.push('<div class="cal-cell cal-empty"></div>'); continue; }
      const lvl = C.nivelCarga(r.horas);
      const inh = S.hol.has(iso);
      const nr = noRecibe.includes(U.DIAS_SEMANA[wd]);
      cells.push(`<button class="cal-cell ${NIVEL[lvl].cls} ${nr ? 'lvl-norecibe' : ''} ${r.atrasadas ? 'cal-atraso' : ''} ${st.dia === iso ? 'sel' : ''} ${iso === S.hoy ? 'today' : ''}" data-d="${iso}" aria-label="${d} de ${U.MESES[mth - 1].toLowerCase()}: ${r.folios} folios, ${r.horas} horas, carga ${NIVEL[lvl].label}${r.atrasadas ? `, ${r.atrasadas} claves atrasadas` : ''}">
        <div class="cal-top"><span class="cal-n">${String(d).padStart(2, '0')}</span><span class="cal-badge">${nr ? 'No recibe' : inh ? 'Inhábil' : NIVEL[lvl].label}</span></div>
        <div class="cal-l"><b>Folios:</b> ${r.folios}</div><div class="cal-l"><b>Prov:</b> ${r.prov}</div><div class="cal-l"><b>Horas:</b> ${U.fmtNumAuto(r.horas)}</div>
        ${r.atrasadas ? `<div class="cal-atr">⚠ ${r.atrasadas} atrasada${r.atrasadas === 1 ? '' : 's'}</div>` : ''}</button>`);
    }
    U.$('#calGrid', root).innerHTML = `<div class="cal-head">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-body">${cells.join('')}</div>
      <div class="legend"><span><i class="sw sw-atraso"></i>Con entregas atrasadas</span><span><i class="sw lvl-sin"></i>Sin carga</span><span><i class="sw lvl-baja"></i>Carga baja (&lt; ${Math.round((SP_CONFIG.UMBRAL_CARGA_MEDIA ?? 0.5) * (SP_CONFIG.CAPACIDAD_HORAS_DIA || 8))} h)</span><span><i class="sw lvl-media"></i>Carga media</span><span><i class="sw lvl-alta"></i>Carga alta (≥ ${SP_CONFIG.CAPACIDAD_HORAS_DIA || 8} h)</span><span><i class="sw lvl-norecibe"></i>No recibe entrega directa</span></div>`;
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
      <div class="day-kpis ${NIVEL[lvl].cls} ${r.atrasadas ? 'day-atraso' : ''}"><div class="day-kpis-head"><b>${U.fmtDate(st.dia)}</b><span class="cal-badge">Carga ${NIVEL[lvl].label.toLowerCase()}</span></div>
        <div class="kpis kpis-2">${UI.kpi('Folios', r.folios)}${UI.kpi('Proveedores', r.prov)}${UI.kpi('Horas', `${U.fmtNumAuto(r.horas)} h`)}${UI.kpi('Claves', r.rows.length)}</div>
        ${r.atrasadas ? `<div class="error-box"><b>${r.atrasadas} clave(s) atrasadas</b> en ${r.foliosAtrasados} folio(s): la fecha estimada ya pasó y siguen sin fecha real de llegada.</div>` : ''}</div>
      ${marcas.length ? `<h4>Marcas principales</h4><div class="mini-list">${marcas.slice(0, 6).map((m) => `<div class="mini-row"><div><b>${U.esc(m.marca)}</b><small>${m.folios} folio(s)</small></div><b>${U.fmtNumAuto(m.horas)} h</b></div>`).join('')}</div>
      <h4>Detalle agrupado por marca</h4>${marcas.map((m) => `<details class="grp" open><summary><span><b>${U.esc(m.marca)}</b><small>${m.folios} folio(s) · ${m.rows.length} registro(s)</small></span><b>${U.fmtNumAuto(m.horas)} h</b></summary>
        ${m.rows.map((p) => `<div class="line clickable ${U.iso(p.fecha_estimada) < S.hoy ? 'line-atraso' : ''}" data-id="${p.id}"><div class="line-top"><b>${U.esc(p.folio_pedido || '')}</b>${UI.status(p.status_pedido)}${U.iso(p.fecha_estimada) < S.hoy ? `<span class="badge badge-critical">ATRASADA ${U.networkdays(U.iso(p.fecha_estimada), S.hoy, S.hol) - 1} día(s) háb.</span>` : ''}</div><div class="muted">${U.esc(p.clave || '')} · ${U.esc(p.solicitante || '')}</div><div>${U.esc(p.descripcion || '')}</div><small>Cantidad: ${U.fmtNumAuto(p.cantidad_solicitada)} · Horas folio: ${U.fmtNumAuto(p.tiempo_descarga_horas)} · Llegada estimada ${U.fmtDate(p.fecha_estimada)}${U.iso(p.fecha_estimada_inicio) && U.iso(p.fecha_estimada_inicio) !== U.iso(p.fecha_estimada) ? ` (desde ${U.fmtDate(p.fecha_estimada_inicio)})` : ''}</small></div>`).join('')}
      </details>`).join('')}` : UI.empty('Sin folios pendientes de llegar este día.')}`;
    U.$$('.line[data-id]', box).forEach((el) => el.onclick = () => APP.abrirDetalle(+el.dataset.id));
  }

  function filtros() {
    APP.filterBar(U.$('#calFilters', root), [
      { k: 'anio', label: 'Año', options: APP.anios, empty: null },
      { k: 'mes', label: 'Mes', options: APP.mesesOpts, empty: null },
      { k: 'solicitante', label: 'Solicitante', options: () => S.lista('SOLICITANTE', 'ENTREGA_DIRECTA'), wide: true },
      { k: 'ver', label: 'Ver', options: () => [{ value: 'ATRASO', label: 'Solo días con atrasos' }], empty: 'Todos los días' },
    ], st, () => { st.dia = null; draw(); });
  }

  APP.register('calendario', {
    render(c) {
      root = c;
      if (!st.anio) { st.anio = S.hoy.slice(0, 4); st.mes = String(+S.hoy.slice(5, 7)); }
      c.innerHTML = `<section class="card card-hero"><div class="card-head"><h2>Entregas Directas · Calendario operativo</h2><p class="muted">Cada folio se cuenta el día de su <b>fecha estimada de llegada</b>; solo los pendientes (sin fecha real y no cancelados). Los días con claves cuya fecha ya pasó se marcan con <b class="error">⚠ atrasadas</b> para darles seguimiento.</p></div><div id="calFilters"></div></section>
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
