/* Vista: Reporte mensual — cumplimiento, clasificación de política, facturación y existencias */
(function () {
  const st = { anio: '', mes: '', modulo: '', comprador: '', base: 'solicitud' };
  let root = null, tablas = [];

  function mesDe(p) {
    if (st.base === 'estimada') { const d = U.iso(p.fecha_estimada); return d ? { anio: +d.slice(0, 4), mes: +d.slice(5, 7) } : null; }
    return C.mesSolicitud(p);
  }
  function universo() {
    return S.pedidos.filter((p) => (!st.modulo || p.modulo === st.modulo) && (!st.comprador || p.comprador === st.comprador));
  }
  const pct = (v) => (v === null || v === undefined) ? null : v;

  /** Tabla definida una vez: sirve para HTML y para Excel */
  function tablaHTML(t, { bars } = {}) {
    return `<div class="table-wrap"><table class="grid compact rep">
      <thead><tr>${t.columns.map((c) => `<th class="${c.type && c.type !== 'text' ? 'num' : ''}${c.sep ? ' col-sep' : ''}">${U.esc(c.header)}</th>`).join('')}${bars ? '<th style="min-width:160px">Composición</th>' : ''}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr class="${r._total ? 'row-total' : ''}">${t.columns.map((c) => {
        const v = r[c.key];
        const txt = c.type === 'pct' ? U.fmtPct(v) : c.type === 'money' ? U.fmtMoney(v) : c.type === 'number' ? U.fmtNumAuto(v) : U.esc(v ?? '');
        return `<td class="${c.type && c.type !== 'text' ? 'num' : ''}${c.sep ? ' col-sep' : ''}${c.fuerte ? ' col-fuerte' : ''}">${txt}</td>`;
      }).join('')}${bars ? `<td>${bars(r)}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${t.columns.length + (bars ? 1 : 0)}">${UI.empty('Sin datos')}</td></tr>`}</tbody></table></div>`;
  }
  const COLS_CUMP = [
    { header: 'Claves', key: 'claves', type: 'number' }, { header: 'Folios', key: 'folios', type: 'number' },
    { header: 'Dentro del plazo', key: 'DENTRO', type: 'number' }, { header: 'Fuera del plazo', key: 'FUERA', type: 'number' },
    { header: 'Pend. vencidas', key: 'PEND_VENCIDA', type: 'number' }, { header: 'Pend. en plazo', key: 'PEND_EN_PLAZO', type: 'number' },
    { header: 'Canceladas', key: 'CANCELADO', type: 'number' }, { header: '% dentro del plazo', key: 'pctDentro', type: 'pct' },
    { header: 'Días prom. entrega', key: 'promDias', type: 'number' },
  ];
  const barsCump = (r) => UI.stackBar([{ label: 'Dentro', value: r.DENTRO, color: UI.COLORS.DENTRO }, { label: 'Fuera', value: r.FUERA, color: UI.COLORS.FUERA }, { label: 'Pend. vencidas', value: r.PEND_VENCIDA, color: UI.COLORS.PEND_VENCIDA }], { height: 14 });
  const resumen = (rows) => { const r = C.resumenCumplimiento(rows); r.promDias = r.promDias === null ? null : Math.round(r.promDias * 10) / 10; return r; };

  function porDimension(rows, key, label, top) {
    const g = [...U.groupBy(rows, (p) => p[key] || `SIN ${label.toUpperCase()}`).entries()].map(([k, rs]) => ({ dim: k, ...resumen(rs) })).sort((a, b) => b.claves - a.claves);
    return { name: `Por ${label}`, columns: [{ header: label, key: 'dim' }, ...COLS_CUMP], rows: top ? g.slice(0, top) : g };
  }

  function draw() {
    const y = +st.anio, mSel = +st.mes;
    const uni = universo();
    const delAnio = uni.filter((p) => { const m = mesDe(p); return m && m.anio === y; });
    const porMes = U.groupBy(delAnio, (p) => mesDe(p).mes);
    tablas = [];

    // A) Resumen por mes
    const filasMes = U.MESES.map((nom, i) => ({ mesNombre: nom, ...resumen(porMes.get(i + 1) || []) }));
    const tot = { mesNombre: 'TOTAL', _total: true, ...resumen(delAnio) };
    const tMes = { name: 'Cumplimiento por mes', columns: [{ header: 'Mes', key: 'mesNombre' }, ...COLS_CUMP], rows: [...filasMes, tot] };
    tablas.push(tMes);

    // B) Detalle del mes
    const rowsMes = mSel ? (porMes.get(mSel) || []) : delAnio;
    const etiquetaMes = mSel ? `${U.MESES[mSel - 1]} ${y}` : `Año ${y}`;
    const tComp = porDimension(rowsMes, 'comprador', 'Comprador');
    const tArea = porDimension(rowsMes, 'area', 'Área');
    const tSol = porDimension(rowsMes, 'solicitante', 'Solicitante', 20);
    const tMarca = porDimension(rowsMes, 'marca', 'Marca', 15);
    tablas.push(tComp, tArea, tSol, tMarca);

    // C) Clasificación de política: todo el módulo sobrepedido (sobrepedido, pedido especial y sucursal entrega directa)
    const spAnio = delAnio.filter((p) => p.modulo === 'SOBREPEDIDO');
    const CATS = [...C.CLASIF_POLITICA, 'SIN CLASIFICAR'];
    const filasPol = U.MESES.map((nom, i) => {
      const rs = spAnio.filter((p) => mesDe(p).mes === i + 1 && !C.cancelado(p));
      const o = { mesNombre: nom };
      o.totalClaves = rs.length;
      CATS.forEach((c) => { o[c] = rs.filter((p) => (p.validacion_clasificacion || 'SIN CLASIFICAR') === c).length; });
      o.monto = U.sum(rs.filter((p) => p.validacion_clasificacion === 'SOBREPEDIDO - VENTA REAL'), (p) => p._costo_total);
      o.cumple = rs.filter((p) => p._cumple_politica === 'CUMPLE').length;
      o.pendiente = rs.filter((p) => p._cumple_politica === 'PENDIENTE').length;
      o.pctCumple = (o.cumple + o.pendiente) ? o.cumple / (o.cumple + o.pendiente) : null;
      return o;
    });
    const totPol = { mesNombre: 'TOTAL', _total: true };
    Object.keys(filasPol[0]).filter((k) => k !== 'mesNombre').forEach((k) => { totPol[k] = k === 'pctCumple' ? null : U.sum(filasPol, (r) => r[k]); });
    totPol.pctCumple = (totPol.cumple + totPol.pendiente) ? totPol.cumple / (totPol.cumple + totPol.pendiente) : null;
    const tPol = { name: 'Clasificación de política', columns: [{ header: 'Mes', key: 'mesNombre' }, { header: 'Total claves', key: 'totalClaves', type: 'number', fuerte: true }, ...CATS.map((c, i) => ({ header: c.replace('SOBREPEDIDO - ', 'SP · ').replace('PEDIDO ESPECIAL - ', 'P.ESP · '), key: c, type: 'number', sep: i === 0 })), { header: 'Monto venta real (MXN)', key: 'monto', type: 'money' }, { header: 'Cumple política', key: 'cumple', type: 'number' }, { header: 'Pendiente política', key: 'pendiente', type: 'number' }, { header: '% cumple', key: 'pctCumple', type: 'pct' }], rows: [...filasPol, totPol] };
    tablas.push(tPol);

    // D) Facturación y existencias
    const filasFac = U.MESES.map((nom, i) => {
      const rs = (porMes.get(i + 1) || []);
      const vivos = rs.filter((p) => !C.cancelado(p));
      return {
        mesNombre: nom, claves: rs.length,
        factTerminado: vivos.filter((p) => p._estatus_fact === 'TERMINADO').length,
        factPendiente: vivos.filter((p) => p._estatus_fact === 'PENDIENTE').length,
        factPendLlego: vivos.filter((p) => p._estatus_fact === 'PENDIENTE' && U.iso(p.fecha_real_llegada)).length,
        factCancelado: rs.filter((p) => p._estatus_fact === 'CANCELADO' || C.cancelado(p)).length,
        conInv: vivos.filter((p) => p._inv === 'CON INV').length, sinInv: vivos.filter((p) => p._inv === 'SIN INV').length,
        sinDato: vivos.filter((p) => !p._inv).length,
      };
    });
    const totFac = { mesNombre: 'TOTAL', _total: true }; Object.keys(filasFac[0]).filter((k) => k !== 'mesNombre').forEach((k) => { totFac[k] = U.sum(filasFac, (r) => r[k]); });
    const tFac = { name: 'Facturación y existencias', columns: [{ header: 'Mes', key: 'mesNombre' }, { header: 'Claves', key: 'claves', type: 'number' }, { header: 'Facturación terminada', key: 'factTerminado', type: 'number' }, { header: 'Pendiente de facturar', key: 'factPendiente', type: 'number' }, { header: 'Pend. facturar ya llegó', key: 'factPendLlego', type: 'number' }, { header: 'Canceladas', key: 'factCancelado', type: 'number' }, { header: 'CON INV', key: 'conInv', type: 'number' }, { header: 'SIN INV', key: 'sinInv', type: 'number' }, { header: 'Sin existencia en maestro', key: 'sinDato', type: 'number' }], rows: [...filasFac, totFac] };
    tablas.push(tFac);

    // KPIs
    const r = resumen(rowsMes);
    const vivosMes = rowsMes.filter((p) => !C.cancelado(p));
    U.$('#repKpis', root).innerHTML = `<div class="kpis">
      ${UI.kpi(`Claves · ${etiquetaMes}`, U.fmtNum(r.claves), `${U.fmtNum(r.folios)} folios`)}
      ${UI.kpi('Dentro del plazo', U.fmtPct(r.pctDentro), `${U.fmtNum(r.DENTRO)} de ${U.fmtNum(r.base)} medibles`, 'kpi-good')}
      ${UI.kpi('Pendientes vencidas', U.fmtNum(r.PEND_VENCIDA), `${U.fmtNum(r.FUERA)} entregadas fuera`, 'kpi-critical')}
      ${UI.kpi('Pendiente de facturar', U.fmtNum(vivosMes.filter((p) => p._estatus_fact === 'PENDIENTE').length), `${U.fmtNum(vivosMes.filter((p) => p._estatus_fact === 'PENDIENTE' && U.iso(p.fecha_real_llegada)).length)} ya llegaron`, 'kpi-warning')}
      ${UI.kpi('Días prom. de entrega', r.promDias === null ? '—' : U.fmtNum(r.promDias, 1))}
    </div>`;

    const legend = `<div class="legend"><span><i class="sw" style="background:${UI.COLORS.DENTRO}"></i>Dentro del plazo</span><span><i class="sw" style="background:${UI.COLORS.FUERA}"></i>Fuera del plazo</span><span><i class="sw" style="background:${UI.COLORS.PEND_VENCIDA}"></i>Pendientes vencidas</span></div>`;
    U.$('#repBody', root).innerHTML = `
      <section class="card"><div class="card-head"><h3>1. Cumplimiento de entregas por mes · ${y}</h3>${legend}</div>${tablaHTML(tMes, { bars: barsCump })}</section>
      <section class="card"><div class="card-head"><h3>2. Detalle · ${U.esc(etiquetaMes)}</h3></div>
        <div class="rep-grid"><div><h4>Por comprador</h4>${tablaHTML(tComp, { bars: barsCump })}</div><div><h4>Por área</h4>${tablaHTML(tArea, { bars: barsCump })}</div>
        <div><h4>Por solicitante (top 20)</h4>${tablaHTML(tSol, { bars: barsCump })}</div><div><h4>Por marca (top 15)</h4>${tablaHTML(tMarca, { bars: barsCump })}</div></div></section>
      <section class="card"><div class="card-head"><h3>3. Sobrepedido, pedido especial y sucursal entrega directa · ${y}</h3><p class="muted">Total de claves del año (sobrepedido, pedido especial y sucursal entrega directa, sin canceladas) y su “Clasificación de política”. Monto = costo total de SOBREPEDIDO - VENTA REAL.</p></div>${tablaHTML(tPol)}</section>
      <section class="card"><div class="card-head"><h3>4. Facturación y existencias · ${y}</h3><p class="muted">Estatus de facturación calculado; INV con la existencia vigente del maestro de artículos.</p></div>${tablaHTML(tFac)}</section>`;
  }

  function filtros() {
    APP.filterBar(U.$('#repFilters', root), [
      { k: 'anio', label: 'Año', options: APP.anios, empty: null },
      { k: 'mes', label: 'Mes del detalle', options: APP.mesesOpts, empty: 'Todo el año' },
      { k: 'modulo', label: 'Módulo', options: APP.moduloOpts },
      { k: 'comprador', label: 'Comprador', options: () => S.lista('COMPRADOR', st.modulo || undefined) },
      { k: 'base', label: 'Mes según', options: () => [{ value: 'solicitud', label: 'Fecha de solicitud (AÑO/MES)' }, { value: 'estimada', label: 'Fecha estimada de llegada' }], empty: null, wide: true },
    ], st, () => draw(), { actions: '<button class="btn btn-primary btn-sm" id="repXls">⭳ Descargar reporte Excel</button>' });
    U.$('#repXls', root).onclick = async () => {
      const ld = UI.loading('Generando reporte…');
      try {
        const sheets = tablas.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ ...c, width: c.key === 'dim' || c.key === 'mesNombre' ? 28 : 16 })), rows: t.rows }));
        await XL.exportar(sheets, `reporte_mensual_${st.anio}${st.mes ? '_' + String(st.mes).padStart(2, '0') : ''}.xlsx`);
      } finally { UI.loading(false); }
    };
  }

  APP.register('reporte', {
    render(c) {
      root = c;
      if (!st.anio) { st.anio = S.hoy.slice(0, 4); st.mes = String(+S.hoy.slice(5, 7)); }
      c.innerHTML = `<section class="card card-hero"><div class="card-head"><h2>Reporte mensual</h2><p class="muted">Cumplimiento de entregas, clasificación de política y facturación/existencias. Todo se puede descargar a Excel.</p></div><div id="repFilters"></div></section><div id="repKpis"></div><div id="repBody"></div>`;
      if (!S.cargado) return;
      filtros(); draw();
    },
    refresh() { APP.go(); },
  });
  S.on((w) => { if (w === 'data' && APP.current === 'reporte' && root && document.body.contains(root)) draw(); });
})();
