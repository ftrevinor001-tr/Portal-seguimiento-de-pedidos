/* Vista: Compradores — composición del cumplimiento por tipo de solicitud */
(function () {
  const st = { tipo: 'ENTREGA DIRECTA', anio: '', mes: '', comprador: '' };
  let root = null;
  const SEGS = [
    { k: 'DENTRO', label: 'Entregadas dentro del plazo' },
    { k: 'FUERA', label: 'Entregadas fuera del plazo' },
    { k: 'PEND_VENCIDA', label: 'Pendientes vencidas' },
  ];

  function filas() {
    const y = +st.anio, mth = +st.mes;
    return S.pedidos.filter((p) => (!st.tipo || p.tipo_solicitud === st.tipo) && (!mth || C.traslapaMes(p, y, mth)) && (mth || (C.ventana(p).fin || '').startsWith(`${y}-`)));
  }

  function draw() {
    const all = filas();
    const rows = st.comprador ? all.filter((p) => p.comprador === st.comprador) : all;
    const r = C.resumenCumplimiento(rows);
    const segs = SEGS.map((s) => ({ label: s.label, value: r[s.k], color: UI.COLORS[s.k] }));
    const base = r.base;
    U.$('#cmpComp', root).innerHTML = `
      <div class="card-head"><h3>Composición del cumplimiento</h3><p class="muted">Las tres categorías suman 100%. Se excluyen pendientes dentro del plazo (${U.fmtNum(r.PEND_EN_PLAZO)}) y canceladas (${U.fmtNum(r.CANCELADO)}).</p></div>
      ${UI.stackBar(segs)}
      <div class="comp-list">${SEGS.map((s) => `<div class="comp-row"><span><i class="dot" style="background:${UI.COLORS[s.k]}"></i>${s.label}</span><b>${U.fmtPct(base ? r[s.k] / base : null)} | ${U.fmtNum(r[s.k])} claves</b></div>`).join('')}</div>`;

    // Tabla por comprador
    const porComp = [...U.groupBy(all, (p) => p.comprador || 'SIN COMPRADOR').entries()].map(([comprador, rs]) => ({ comprador, ...C.resumenCumplimiento(rs) }))
      .sort((a, b) => b.claves - a.claves);
    U.$('#cmpTable', root).innerHTML = `<div class="card-head"><h3>Cumplimiento por comprador</h3></div><div class="table-wrap"><table class="grid">
      <thead><tr><th>Comprador</th><th class="num">Claves</th><th class="num">Folios</th><th class="num">Dentro</th><th class="num">Fuera</th><th class="num">Pend. vencidas</th><th class="num">Pend. en plazo</th><th class="num">Canceladas</th><th style="min-width:180px">Composición</th><th class="num">% dentro</th><th class="num">Días prom.</th></tr></thead>
      <tbody>${porComp.map((x) => `<tr class="clickable ${st.comprador === x.comprador ? 'row-sel' : ''}" data-c="${U.esc(x.comprador)}"><td><b>${U.esc(x.comprador)}</b></td><td class="num">${U.fmtNum(x.claves)}</td><td class="num">${U.fmtNum(x.folios)}</td><td class="num">${U.fmtNum(x.DENTRO)}</td><td class="num">${U.fmtNum(x.FUERA)}</td><td class="num">${U.fmtNum(x.PEND_VENCIDA)}</td><td class="num">${U.fmtNum(x.PEND_EN_PLAZO)}</td><td class="num">${U.fmtNum(x.CANCELADO)}</td>
        <td>${UI.stackBar(SEGS.map((s) => ({ label: s.label, value: x[s.k], color: UI.COLORS[s.k] })), { height: 14 })}</td><td class="num"><b>${U.fmtPct(x.pctDentro)}</b></td><td class="num">${x.promDias === null ? '—' : U.fmtNum(x.promDias, 1)}</td></tr>`).join('') || `<tr><td colspan="11">${UI.empty('Sin claves para estos filtros')}</td></tr>`}</tbody></table></div>`;
    U.$$('#cmpTable tr[data-c]', root).forEach((tr) => tr.onclick = () => { st.comprador = st.comprador === tr.dataset.c ? '' : tr.dataset.c; filtros(); draw(); });

    // Pendientes vencidas
    const venc = rows.filter((p) => p._cumplimiento === 'PEND_VENCIDA').sort((a, b) => (b._incumplimiento || 0) - (a._incumplimiento || 0));
    U.$('#cmpVenc', root).innerHTML = `<div class="card-head"><h3>Pendientes vencidas${st.comprador ? ` · ${U.esc(st.comprador)}` : ''}</h3><span class="muted">${U.fmtNum(venc.length)} claves</span></div>
      ${venc.length ? `<div class="table-wrap"><table class="grid compact"><thead><tr><th>Folio</th><th>Clave</th><th>Descripción</th><th>Comprador</th><th>Solicitante</th><th>F. estimada</th><th class="num">Días hábiles de retraso</th></tr></thead><tbody>${venc.slice(0, 200).map((p) => `<tr class="clickable" data-id="${p.id}"><td>${U.esc(p.folio_pedido || '')}</td><td>${U.esc(p.clave || '')}</td><td class="desc">${U.esc(p.descripcion || '')}</td><td>${U.esc(p.comprador || '')}</td><td>${U.esc(p.solicitante || '')}</td><td>${U.fmtDate(p.fecha_estimada)}</td><td class="num"><b>${U.esc(p._incumplimiento)}</b></td></tr>`).join('')}</tbody></table></div>` : UI.empty('Sin pendientes vencidas 🎉')}`;
    U.$$('#cmpVenc tr[data-id]', root).forEach((tr) => tr.onclick = () => APP.abrirDetalle(+tr.dataset.id));
  }

  function filtros() {
    APP.filterBar(U.$('#cmpFilters', root), [
      { k: 'tipo', label: 'Tipo de solicitud', options: () => C.TIPOS_SOLICITUD, empty: 'Todos' },
      { k: 'anio', label: 'Año', options: APP.anios, empty: null },
      { k: 'mes', label: 'Mes', options: APP.mesesOpts, empty: 'Todo el año' },
      { k: 'comprador', label: 'Comprador', options: () => U.sortEs(U.uniq(S.pedidos.filter((p) => !st.tipo || p.tipo_solicitud === st.tipo).map((p) => p.comprador))), wide: true },
    ], st, () => draw());
  }

  APP.register('compradores', {
    render(c) {
      root = c;
      if (!st.anio) { st.anio = S.hoy.slice(0, 4); st.mes = String(+S.hoy.slice(5, 7)); }
      c.innerHTML = `<section class="card card-hero"><div class="card-head"><h2>Compradores · Reporte de cumplimiento</h2><p class="muted">Claves cuya ventana de fecha estimada cae en el mes. Dentro del plazo = llegó en o antes de la fecha estimada (fin).</p></div><div id="cmpFilters"></div></section>
        <section class="card" id="cmpComp"></section><section class="card" id="cmpTable"></section><section class="card" id="cmpVenc"></section>`;
      if (!S.cargado) return;
      filtros(); draw();
    },
    refresh() { APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'compradores' && root && document.body.contains(root)) draw(); });
})();
