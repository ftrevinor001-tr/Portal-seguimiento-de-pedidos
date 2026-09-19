/* Vista: Datos — carga inicial, maestro de artículos, descargas y bitácora */
(function () {
  let root = null;
  const bit = { usuario: '', accion: '', q: '' };

  async function contar() {
    const t = ['sp_pedidos', 'sp_articulos', 'sp_cat_tiempo_entrega', 'sp_cat_tiempo_descarga', 'sp_cat_dias_no_recepcion', 'sp_cat_dias_inhabiles', 'sp_cat_listas', 'sp_bitacora'];
    const out = {};
    await Promise.all(t.map(async (x) => { try { out[x] = await API.count(x, [], x === 'sp_articulos' ? 'clave' : 'id'); } catch (e) { out[x] = null; } }));
    return out;
  }

  /* -------- Carga inicial desde carga_inicial.xlsx -------- */
  const SHEETS = {
    PEDIDOS: 'sp_pedidos', CAT_TIEMPO_ENTREGA: 'sp_cat_tiempo_entrega', CAT_TIEMPO_DESCARGA: 'sp_cat_tiempo_descarga',
    CAT_DIAS_NO_RECEPCION: 'sp_cat_dias_no_recepcion', CAT_DIAS_INHABILES: 'sp_cat_dias_inhabiles', CAT_LISTAS: 'sp_cat_listas', ARTICULOS: 'sp_articulos',
  };
  function tipar(table, o) {
    const r = {};
    for (const [k, v0] of Object.entries(o)) {
      if (!k || k.startsWith('_')) continue;
      let v = v0 === undefined ? null : v0;
      if (table === 'sp_pedidos') {
        const f = S.FIELD[k];
        if (f) v = f.type === 'bool' ? (v === true || U.norm(v) === 'TRUE' || U.norm(v) === 'SI' || v === 1) : S.coerce(k, v);
        else if (k === 'activo') v = !(v === false || U.norm(v) === 'FALSE' || U.norm(v) === 'NO');
        else if (k === 'origen_fila') v = v === null ? null : Number(v);
        else if (typeof v === 'string') v = v.trim() || null;
        if (['anio', 'dias_inicio', 'dias_fin'].includes(k) && v !== null) v = Math.round(v);
      } else if (['dias_inicio', 'dias_fin', 'horas', 'existencia', 'costo'].includes(k)) v = v === null || v === '' ? null : Number(v);
      else if (k === 'fecha') v = U.iso(v);
      else if (k === 'clave') v = v === null ? null : String(v).trim();
      else if (typeof v === 'string') v = v.trim() || null;
      r[k] = v;
    }
    return r;
  }

  async function cargaInicial(file) {
    const ld = UI.loading('Leyendo archivo…');
    let wb;
    try { wb = await XL.readFile(file); } catch (e) { UI.loading(false); UI.toast(`No se pudo leer: ${e.message}`, 'error'); return; }
    const plan = [];
    for (const [sh, table] of Object.entries(SHEETS)) {
      if (!wb.sheetNames.includes(sh)) continue;
      const { rows } = XL.toObjects(await wb.rows(sh));
      plan.push({ sh, table, rows: rows.map((o) => tipar(table, o)) });
    }
    UI.loading(false);
    if (!plan.length) { UI.toast('El archivo no tiene las hojas de carga_inicial.xlsx (PEDIDOS, CAT_…, ARTICULOS)', 'error'); return; }
    const counts = await contar();
    const body = `<p>Se detectaron estas hojas. Marca las que quieres subir:</p>
      <table class="grid compact"><thead><tr><th></th><th>Hoja</th><th>Tabla</th><th class="num">Filas en archivo</th><th class="num">Ya en la base</th></tr></thead><tbody>
      ${plan.map((p, i) => `<tr><td><input type="checkbox" data-i="${i}" ${counts[p.table] ? '' : 'checked'}></td><td>${p.sh}</td><td>${p.table}</td><td class="num">${U.fmtNum(p.rows.length)}</td><td class="num">${counts[p.table] === null ? '?' : U.fmtNum(counts[p.table])}</td></tr>`).join('')}</tbody></table>
      <p class="warn-box">Las tablas que ya tienen datos vienen desmarcadas para no duplicar. Si subes PEDIDOS otra vez se agregarán como registros nuevos (los artículos se actualizan por clave, sin duplicar).</p>`;
    const m = UI.modal({ title: 'Carga inicial', body, footer: '<button class="btn btn-ghost" data-a="c">Cancelar</button><button class="btn btn-primary" data-a="s">Subir a Supabase</button>' });
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      if (!APP.requiereEdicion()) return;
      const sel = U.$$('[data-i]:checked', m.el).map((c) => plan[+c.dataset.i]);
      if (!sel.length) { UI.toast('No seleccionaste hojas', 'warn'); return; }
      m.close();
      const ld2 = UI.loading('Subiendo…');
      try {
        for (const p of sel) {
          const label = `${p.sh}: `;
          if (p.table === 'sp_articulos') {
            await API.upsert('sp_articulos', p.rows, 'clave', { onProgress: (d, t) => ld2.progress(d, t, `${label}${U.fmtNum(d)} de ${U.fmtNum(t)}`) });
          } else {
            const rows = p.rows.map((r) => p.table === 'sp_pedidos' ? { ...r, creado_por: r.creado_por || 'CARGA INICIAL', actualizado_por: S.user } : { ...r, actualizado_por: S.user });
            await API.insert(p.table, rows, { returning: false, chunk: 500, onProgress: (d, t) => ld2.progress(d, t, `${label}${U.fmtNum(d)} de ${U.fmtNum(t)}`) });
          }
          await API.insert('sp_cargas', [{ tipo: `CARGA_INICIAL:${p.sh}`, archivo: file.name, registros: p.rows.length, usuario: S.user }], { returning: false });
        }
        UI.toast('Carga inicial terminada');
        S.clearArtCache();
        await APP.reload();
        APP.go();
      } catch (e) { UI.toast(`Error en la carga: ${e.message}`, 'error'); } finally { UI.loading(false); }
    };
  }

  /* -------- Maestro de artículos -------- */
  const ART_MAP = {
    clave: ['CLAVE', 'IDARTICULO', 'ID ARTICULO', 'CODIGO'], descripcion: ['DESCRIPCION'], marca: ['MARCA'], grupo: ['GRUPO'],
    estatus_vta: ['ESTATUS_VTA', 'ESTATUS VTA'], estatus_compra: ['ESTATUS_COMPRA', 'ESTATUS COMPRA'], unidad: ['UNIDAD', 'UNIDAD_BV'],
    existencia: ['EXISTENCIA', 'EXIUNIBAS'], costo: ['COSTO', 'COSTOUC_BM'], comprador: ['COMPRADOR'],
  };
  async function cargaArticulos(file) {
    const ld = UI.loading('Leyendo maestro de artículos… (puede tardar con archivos grandes)');
    try {
      const wb = await XL.readFile(file);
      let best = null;
      const orden = [...wb.sheetNames].sort((a, b) => (/^(E|ARTICULOS|CSV)$/i.test(b) ? 1 : 0) - (/^(E|ARTICULOS|CSV)$/i.test(a) ? 1 : 0));
      for (const sh of orden) {
        const rows = await wb.rows(sh);
        const hdr = (rows[0] || []).map((h) => U.norm(h));
        const idx = {}; for (const [k, names] of Object.entries(ART_MAP)) { const i = hdr.findIndex((h) => names.includes(h)); if (i >= 0) idx[k] = i; }
        if (idx.clave !== undefined && (idx.existencia !== undefined || idx.comprador !== undefined)) { best = { sh, rows, idx }; break; }
      }
      if (!best) { UI.toast('No encontré columnas CLAVE/IDARTICULO y EXISTENCIA/EXIUNIBAS o COMPRADOR en ninguna hoja', 'error'); return; }
      const out = new Map();
      for (let i = 1; i < best.rows.length; i++) {
        const r = best.rows[i]; if (!r || r[best.idx.clave] === null || r[best.idx.clave] === undefined) continue;
        const o = {}; for (const [k, j] of Object.entries(best.idx)) o[k] = r[j] === undefined ? null : r[j];
        const t = tipar('sp_articulos', o);
        if (typeof o.clave === 'number') t.clave = String(Math.round(o.clave));
        if ('comprador' in best.idx) t.comprador = (o.comprador === null || o.comprador === 0 || /^0(\.0+)?$/.test(String(o.comprador).trim())) ? null : U.norm(o.comprador) || null;
        if (!t.clave) continue;
        const prev = out.get(t.clave);
        if (prev && 'comprador' in t) {
          // Una clave puede venir repetida con distinto comprador: se guardan todos ("A | B")
          const set = U.uniq([...C.compradoresDeClave(prev.comprador), ...C.compradoresDeClave(t.comprador)]);
          t.comprador = set.length ? set.join(' | ') : null;
        }
        out.set(t.clave, prev ? { ...prev, ...Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== null || k === 'comprador')) } : t);
      }
      const rows = [...out.values()];
      UI.loading(false);
      if (!(await UI.confirm(`Hoja “${best.sh}”: ${U.fmtNum(rows.length)} artículos. Se actualizarán por clave los datos que traiga el archivo${'comprador' in best.idx ? ' (incluye COMPRADOR)' : ''}. ¿Continuar?`))) return;
      if (!APP.requiereEdicion()) return;
      const ld2 = UI.loading('Actualizando artículos…');
      const stamp = new Date().toISOString();
      await API.upsert('sp_articulos', rows.map((r) => ({ ...r, actualizado_en: stamp })), 'clave', { onProgress: (d, t) => ld2.progress(d, t, `Artículos ${U.fmtNum(d)} de ${U.fmtNum(t)}`) });
      await API.insert('sp_cargas', [{ tipo: 'ARTICULOS', archivo: file.name, registros: rows.length, usuario: S.user }], { returning: false });
      UI.toast(`${U.fmtNum(rows.length)} artículos actualizados`);
      S.clearArtCache();
      await APP.reload();
      APP.go();
    } catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
  }

  /* -------- Reporte de tickets (v1.3.0): reemplaza los tickets del portal -------- */
  const TK_MAP = {
    folio_pedido: ['TICKET', 'FOLIO', 'NO. TICKET'],
    solicitante: ['SOLICITANTE', 'AREA SOLICITANTE'],
    clave: ['CLAVE'],
    descripcion: ['DESCRIPCION', 'DESCRIPCIÓN'],
    comprador: ['COMPRADOR'],
    status_pedido: ['STATUS DEL TICKET', 'STATUS'],
    categoria_ticket: ['CATEGORIA', 'CATEGORÍA'],
    f_sol: ['FECHA DE SOLICITUD', 'FECHA SOLICITUD'],
    h_sol: ['HORA DE SOLICITUD', 'HORA SOLICITUD'],
    f_asig: ['FECHA ASIGNACION', 'FECHA DE ASIGNACION', 'FECHA ASIGNACIÓN'],
    h_asig: ['HORA DE ASIGNACION', 'HORA ASIGNACION', 'HORA DE ASIGNACIÓN'],
    fecha_limite_cotizacion: ['FECHA FINAL COTIZACION', 'FECHA FINAL COTIZACIÓN', 'FECHA LIMITE COTIZACION'],
    fecha_cotizacion_usuario: ['FECHA ENTREGA COTIZACION', 'FECHA ENTREGA COTIZACIÓN'],
    fecha_autorizacion_compra: ['FECHA AUTORIZACION COMPRA', 'FECHA AUTORIZACIÓN COMPRA'],
    fecha_pago_proveedor: ['FECHA PAGO PROVEEDOR'],
    tiempo_entrega: ['TIEMPO DE ENTREGA MANEJADO CUADRO C.', 'TIEMPO DE ENTREGA', 'TIEMPO DE ENTREGA MANEJADO'],
    fecha_estimada: ['FECHA ESTIMADA DE LLEGADA COMPRA', 'FECHA ESTIMADA DE LLEGADA'],
    fecha_real_llegada: ['FECHA REAL DE LLEGADA'],
    comentarios: ['COMENTARIOS'],
  };
  // Compradores que en el reporte vienen escritos de varias formas
  const TK_ALIAS = { 'JULISSA YAJAIRA MEZA': 'JULISSA YAHAIRA MEZA' };
  // Solicitantes que son la misma área escrita distinto (confirmado con el área de compras)
  const TK_AREA_ALIAS = { RH: 'RECURSOS HUMANOS', CALIDAD: 'CONTROL DE CALIDAD', ADMINISTRATIVO: 'ADMINISTRACION' };
  const norm1 = (v) => U.blank(v) ? null : U.norm(String(v)).replace(/\s+/g, ' ');
  /** Hora: el Excel la guarda como fracción del día (0.5 = 12:00) o como texto "13:25" */
  function horaTexto(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      const min = Math.round(v * 24 * 60) % (24 * 60);
      return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    }
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
  }
  const conHora = (fecha, hora) => { const f = U.iso(fecha); if (!f) return null; const h = horaTexto(hora); return h ? `${f}T${h}:00` : f; };

  async function cargaTickets(file) {
    const ld = UI.loading('Leyendo el reporte de tickets…');
    let wb, plan = null, cats = [];
    try {
      wb = await XL.readFile(file);
      const hoja = wb.sheetNames.find((n) => /BASE DE DATOS|TICKETS?/i.test(n)) || wb.sheetNames[0];
      const { rows } = XL.toObjects(await wb.rows(hoja));
      const pick = (o, names) => { const k = Object.keys(o).find((x) => names.includes(U.norm(x).replace(/\s+/g, ' '))); return k ? o[k] : null; };
      const avisos = { anios: 0, alias: 0, areas: 0, sinFecha: 0 };
      const filas = rows.map((o) => {
        const v = {}; for (const [k, names] of Object.entries(TK_MAP)) v[k] = pick(o, names);
        if (U.blank(v.folio_pedido) && U.blank(v.descripcion)) return null;
        const fs = conHora(v.f_sol, v.h_sol);
        if (!fs) avisos.sinFecha++;
        const anio = fs ? +fs.slice(0, 4) : null, mesN = fs ? +fs.slice(5, 7) : null;
        const anioArchivo = pick(o, ['AÑO', 'ANIO', 'AÑO ']);
        if (anio && anioArchivo && Number(anioArchivo) !== anio) avisos.anios++;
        let comprador = norm1(v.comprador);
        if (comprador && TK_ALIAS[comprador]) { comprador = TK_ALIAS[comprador]; avisos.alias++; }
        let solicitante = norm1(v.solicitante);
        if (solicitante && TK_AREA_ALIAS[solicitante]) { solicitante = TK_AREA_ALIAS[solicitante]; avisos.areas++; }
        const te = v.tiempo_entrega;
        const teNum = te !== null && te !== '' && !isNaN(te) ? Number(te) : null;
        return {
          modulo: 'TICKET', tipo_solicitud: 'TICKET',
          folio_pedido: v.folio_pedido === null ? null : String(v.folio_pedido).trim(),
          clave: norm1(v.clave) || 'NUEVO', descripcion: U.blank(v.descripcion) ? null : String(v.descripcion).trim(),
          cantidad_solicitada: 1,
          solicitante, comprador, area: solicitante,
          categoria_ticket: norm1(v.categoria_ticket),
          status_pedido: norm1(v.status_pedido) || 'PENDIENTE',
          anio, mes: mesN ? U.MESES[mesN - 1] : null,
          fecha_solicitud: fs, fecha_asignacion: conHora(v.f_asig, v.h_asig),
          fecha_limite_cotizacion: U.isoEs(v.fecha_limite_cotizacion),
          fecha_cotizacion_usuario: U.isoEs(v.fecha_cotizacion_usuario),
          fecha_autorizacion_compra: U.isoEs(v.fecha_autorizacion_compra),
          fecha_pago_proveedor: U.isoEs(v.fecha_pago_proveedor),
          tiempo_entrega: teNum === null ? (U.blank(te) ? null : String(te).trim()) : `${teNum} DIAS HABILES`,
          dias_fin: teNum, tipo_dias: teNum === null ? null : 'HABILES',
          fecha_estimada: U.isoEs(v.fecha_estimada), fecha_estimada_manual: true,
          fecha_real_llegada: U.isoEs(v.fecha_real_llegada),
          comentarios: U.blank(v.comentarios) ? null : String(v.comentarios).trim(),
          origen_hoja: hoja, activo: true,
        };
      }).filter(Boolean);
      // Hoja de categorías (T.E. COTIZACIONES): días de cotización por categoría
      const shCat = wb.sheetNames.find((n) => /COTIZACION/i.test(n));
      if (shCat) {
        const { rows: cr } = XL.toObjects(await wb.rows(shCat));
        cats = cr.map((o) => {
          const k = Object.keys(o);
          const cat = o[k.find((x) => /CATEGOR/i.test(x))], d = o[k.find((x) => /DIAS|DÍAS/i.test(x))];
          return U.blank(cat) ? null : { categoria: norm1(cat), dias: Number(d) || 3 };
        }).filter(Boolean);
      }
      plan = { filas, avisos, hoja };
    } catch (e) { UI.loading(false); UI.toast(`No se pudo leer el archivo: ${e.message}`, 'error'); return; }
    UI.loading(false);
    if (!plan.filas.length) { UI.toast('No encontré renglones de tickets en el archivo (se espera la hoja BASE DE DATOS con TICKET, SOLICITANTE, DESCRIPCION…)', 'error'); return; }

    const actuales = S.pedidos.filter((p) => p.modulo === 'TICKET');
    const folios = U.uniq(plan.filas.map((r) => r.folio_pedido)).length;
    const body = `<p>Del archivo <b>${U.esc(file.name)}</b> (hoja ${U.esc(plan.hoja)}):</p>
      <ul class="lista-check">
        <li><b>${U.fmtNum(plan.filas.length)}</b> renglones · <b>${U.fmtNum(folios)}</b> tickets</li>
        <li>Se darán de baja los <b>${U.fmtNum(actuales.length)}</b> renglones de tickets que hay hoy en el portal (quedan en “Ver dados de baja” y en la bitácora).</li>
        ${cats.length ? `<li>Se actualizarán <b>${U.fmtNum(cats.length)}</b> categorías de cotización.</li>` : ''}
        ${plan.avisos.alias ? `<li>${plan.avisos.alias} renglón(es) con el comprador escrito distinto se unifican (JULISSA YAJAIRA → JULISSA YAHAIRA MEZA).</li>` : ''}
        ${plan.avisos.areas ? `<li>${plan.avisos.areas} renglón(es) con el solicitante escrito distinto se unifican (RH → RECURSOS HUMANOS, CALIDAD → CONTROL DE CALIDAD, ADMINISTRATIVO → ADMINISTRACION).</li>` : ''}
        ${plan.avisos.anios ? `<li>${plan.avisos.anios} renglón(es) traían un AÑO que no coincide con la fecha de solicitud: se corrige con la fecha.</li>` : ''}
        ${plan.avisos.sinFecha ? `<li class="error">${plan.avisos.sinFecha} renglón(es) sin fecha de solicitud.</li>` : ''}
      </ul>
      <p class="warn-box">Los sobrepedidos y las entregas directas no se tocan. Esta operación solo reemplaza los tickets.</p>`;
    const m = UI.modal({ title: 'Reemplazar tickets con el reporte', body, footer: '<button class="btn btn-ghost" data-a="c">Cancelar</button><button class="btn btn-success" data-a="s">Dar de baja y cargar</button>' });
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      if (!APP.requiereEdicion()) return;
      m.close();
      const ld2 = UI.loading('Reemplazando tickets…');
      try {
        if (cats.length) {
          ld2.text('Actualizando categorías de cotización…');
          await API.upsert('sp_cat_categorias_ticket', cats.map((c) => ({ ...c, actualizado_por: S.user })), 'categoria');
        }
        if (actuales.length) {
          ld2.text(`Dando de baja ${U.fmtNum(actuales.length)} tickets anteriores…`);
          await S.updateMany(actuales.map((p) => p.id), { activo: false });
        }
        ld2.text('Cargando el reporte…');
        const rows = plan.filas.map((r) => ({ ...r, creado_por: `REPORTE ${file.name}`.slice(0, 80), actualizado_por: S.user }));
        await API.insert('sp_pedidos', rows, { returning: false, onProgress: (d, t) => ld2.progress(d, t, `Tickets ${U.fmtNum(d)} de ${U.fmtNum(t)}`) });
        await API.insert('sp_cargas', [{ tipo: 'REPORTE_TICKETS', archivo: file.name, registros: rows.length, usuario: S.user }], { returning: false });
        UI.toast(`Listo: ${U.fmtNum(rows.length)} renglones de tickets cargados (${U.fmtNum(folios)} tickets)`);
        await APP.reload();
        location.hash = '#/tickets';
      } catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
    };
  }

  /* -------- Reemplazar sobrepedido y entregas directas (v1.4.0) -------- */
  const MOD_LABEL = { SOBREPEDIDO: 'Sobrepedido / especial / sucursal', ENTREGA_DIRECTA: 'Entregas directas' };
  async function cargaPedidos(file) {
    const ld = UI.loading('Leyendo el archivo…');
    let filas = [], hoja = '';
    try {
      const wb = await XL.readFile(file);
      hoja = wb.sheetNames.find((n) => U.norm(n) === 'PEDIDOS') || wb.sheetNames[0];
      const { rows } = XL.toObjects(await wb.rows(hoja));
      filas = rows.map((o) => tipar('sp_pedidos', o))
        .filter((r) => r.modulo === 'SOBREPEDIDO' || r.modulo === 'ENTREGA_DIRECTA');
    } catch (e) { UI.loading(false); UI.toast(`No se pudo leer el archivo: ${e.message}`, 'error'); return; }
    UI.loading(false);
    if (!filas.length) { UI.toast('El archivo no tiene renglones de sobrepedido ni de entregas directas (se espera la hoja PEDIDOS con la columna “modulo”)', 'error'); return; }

    const porMod = (m) => filas.filter((r) => r.modulo === m).length;
    const actuales = S.pedidos.filter((p) => p.modulo === 'SOBREPEDIDO' || p.modulo === 'ENTREGA_DIRECTA');
    const sinFecha = filas.filter((r) => !r.fecha_solicitud).length;
    const body = `<p>Del archivo <b>${U.esc(file.name)}</b> (hoja ${U.esc(hoja)}):</p>
      <ul class="lista-check">
        <li><b>${U.fmtNum(porMod('ENTREGA_DIRECTA'))}</b> renglones de entregas directas</li>
        <li><b>${U.fmtNum(porMod('SOBREPEDIDO'))}</b> renglones de sobrepedido / especial / sucursal</li>
        <li>Se darán de baja los <b>${U.fmtNum(actuales.length)}</b> renglones que hay hoy en esos dos módulos (quedan en “Ver dados de baja” y en la bitácora).</li>
        ${sinFecha ? `<li class="error">${U.fmtNum(sinFecha)} renglón(es) sin fecha de solicitud.</li>` : ''}
      </ul>
      <p class="warn-box">Los tickets no se tocan. Esta operación solo reemplaza sobrepedido y entregas directas.</p>`;
    const m = UI.modal({ title: 'Reemplazar sobrepedido y entregas directas', body, footer: '<button class="btn btn-ghost" data-a="c">Cancelar</button><button class="btn btn-success" data-a="s">Dar de baja y cargar</button>' });
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      if (!APP.requiereEdicion()) return;
      m.close();
      const ld2 = UI.loading('Reemplazando pedidos…');
      try {
        if (actuales.length) {
          ld2.text(`Dando de baja ${U.fmtNum(actuales.length)} renglones anteriores…`);
          await S.updateMany(actuales.map((p) => p.id), { activo: false });
        }
        ld2.text('Cargando el archivo…');
        const rows = filas.map((r) => ({ ...r, activo: true, creado_por: r.creado_por || `CARGA ${file.name}`.slice(0, 80), actualizado_por: S.user }));
        await API.insert('sp_pedidos', rows, { returning: false, onProgress: (d, t) => ld2.progress(d, t, `Pedidos ${U.fmtNum(d)} de ${U.fmtNum(t)}`) });
        await API.insert('sp_cargas', [{ tipo: 'REEMPLAZO_PEDIDOS', archivo: file.name, registros: rows.length, usuario: S.user }], { returning: false });
        UI.toast(`Listo: ${U.fmtNum(rows.length)} renglones cargados`);
        await APP.reload();
        location.hash = '#/sobrepedido';
      } catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
    };
  }

  /* -------- Descargas -------- */
  async function descargarBase() {
    const ld = UI.loading('Preparando Excel completo…');
    try {
      const bajas = S.bajas || await S.loadBajas();
      const all = [...S.pedidos, ...bajas];
      const sheets = C.MODULOS.map((m) => ({ name: C.MODULO_LABEL[m.value], columns: [...APP.columnasExport(m.value), { header: 'ACTIVO', value: (p) => p.activo === false ? 'NO' : 'SI' }], rows: all.filter((p) => p.modulo === m.value).sort((a, b) => a.id - b.id) }));
      const catCols = (keys) => keys.map((k) => ({ header: k.toUpperCase(), key: k, type: k === 'fecha' ? 'date' : ['dias_inicio', 'dias_fin', 'horas'].includes(k) ? 'number' : 'text' }));
      sheets.push(
        { name: 'CAT TIEMPO ENTREGA', columns: catCols(['proveedor', 'solicitante', 'entrega_directa', 'tiempo_entrega', 'dias_inicio', 'dias_fin', 'tipo_dias', 'activo']), rows: S.cat.te },
        { name: 'CAT TIEMPO DESCARGA', columns: catCols(['proveedor', 'marca', 'tipo_material', 'horas', 'activo']), rows: S.cat.td },
        { name: 'CAT DIAS NO RECEPCION', columns: catCols(['solicitante', 'dia', 'activo']), rows: S.cat.dnr },
        { name: 'CAT DIAS INHABILES', columns: catCols(['fecha', 'descripcion', 'activo']), rows: S.cat.inh },
      );
      await XL.exportar(sheets, `base_seguimiento_pedidos_${S.hoy}.xlsx`);
    } catch (e) { UI.toast(e.message, 'error'); } finally { UI.loading(false); }
  }

  /* -------- Bitácora -------- */
  async function drawBitacora() {
    const box = U.$('#bitBox', root);
    if (!box) return;
    box.innerHTML = UI.empty('Cargando…');
    try {
      const filters = [];
      if (bit.usuario) filters.push(['usuario', 'ilike', `*${bit.usuario}*`]);
      if (bit.accion) filters.push(['accion', 'eq', bit.accion]);
      if (bit.q && /^\d+$/.test(bit.q)) filters.push(['registro_id', 'eq', bit.q]);
      else if (bit.q) filters.push(['campo', 'ilike', `*${bit.q}*`]);
      const rows = await API.select('sp_bitacora', { filters, order: 'id.desc', limit: 300 });
      box.innerHTML = rows.length ? `<div class="table-wrap"><table class="grid compact"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Registro</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="nowrap">${U.fmtDateTime(r.fecha)}</td><td>${U.esc(r.usuario || '')}</td><td>${U.esc(r.accion)}</td><td>${U.esc(r.tabla.replace('sp_', ''))}</td><td>${r.tabla === 'sp_pedidos' ? `<a href="#" data-id="${r.registro_id}">${r.registro_id}</a>` : r.registro_id}</td><td>${U.esc(S.FIELD[r.campo] ? S.FIELD[r.campo].label : r.campo || '')}</td><td class="desc">${U.esc(r.valor_anterior ?? '')}</td><td class="desc">${U.esc(r.valor_nuevo ?? '')}</td></tr>`).join('')}
        </tbody></table></div><p class="muted small">Últimos 300 movimientos con estos filtros.</p>` : UI.empty('Sin movimientos');
      U.$$('a[data-id]', box).forEach((a) => a.onclick = (e) => { e.preventDefault(); if (S.byId(+a.dataset.id)) APP.abrirDetalle(+a.dataset.id); else UI.toast('Ese registro está dado de baja: actívalo con “Ver dados de baja” en Seguimiento', 'warn'); });
    } catch (e) { box.innerHTML = `<p class="error">${U.esc(e.message)}</p>`; }
  }

  APP.register('datos', {
    async render(c) {
      root = c;
      c.innerHTML = `
        <div class="rep-grid">
          <section class="card"><div class="card-head"><h2>Estado de la base</h2></div><div id="dbCounts">${UI.empty('Consultando…')}</div></section>
          <section class="card"><div class="card-head"><h2>Descargar información</h2></div>
            <p class="muted">Excel con los tres módulos (incluye campos calculados y dados de baja) y los catálogos.</p>
            <button class="btn btn-primary" id="btnBase">⭳ Descargar base completa (Excel)</button></section>
          <section class="card"><div class="card-head"><h2>Actualizar maestro de artículos</h2>${S.puedeEditar() ? '' : '<span class="pill pill-ro">🔒 Solo lectura</span>'}</div>
            <p class="muted">Sube la exportación del sistema (hoja con <b>IDARTICULO</b> y <b>EXIUNIBAS</b>, como la pestaña “E”) o un archivo con CLAVE y COMPRADOR (asignación de compradores). También acepta CSV con CLAVE, DESCRIPCION, MARCA, UNIDAD, EXISTENCIA, COSTO, COMPRADOR. Actualiza por clave solo las columnas que traiga.</p>
            ${S.puedeEditar() ? '<input type="file" id="fileArt" accept=".xlsx,.csv">' : '<button class="btn btn-primary btn-sm" data-entrar>🔒 Entrar para actualizar</button>'}<div id="lastArt" class="muted small"></div></section>
          <section class="card"><div class="card-head"><h2>Sobrepedido y entregas directas · reemplazar</h2>${S.puedeEditar() ? '' : '<span class="pill pill-ro">🔒 Solo lectura</span>'}</div>
            <p class="muted">Sube el archivo de carga (hoja <b>PEDIDOS</b>, con la columna <b>modulo</b>). Se dan de baja los renglones que ya están en esos dos módulos y se carga el archivo completo. Los tickets no se tocan.</p>
            ${S.puedeEditar() ? '<input type="file" id="filePed" accept=".xlsx,.csv">' : '<button class="btn btn-primary btn-sm" data-entrar>🔒 Entrar para cargar</button>'}</section>
          <section class="card"><div class="card-head"><h2>Tickets · reporte</h2>${S.puedeEditar() ? '' : '<span class="pill pill-ro">🔒 Solo lectura</span>'}</div>
            <p class="muted">Sube el <b>REPORTE DE TICKETS</b> (hoja <b>BASE DE DATOS</b>). Se dan de baja los tickets que ya están en el portal y se carga el archivo completo. Si el archivo trae la hoja de categorías, también se actualizan los días de cotización.</p>
            ${S.puedeEditar() ? '<input type="file" id="fileTk" accept=".xlsx,.csv">' : '<button class="btn btn-primary btn-sm" data-entrar>🔒 Entrar para cargar</button>'}</section>
          <section class="card"><div class="card-head"><h2>Carga inicial</h2></div>
            <p class="muted">Solo la primera vez: sube <b>carga_inicial.xlsx</b> (datos ya limpios del Google Sheet). Puedes elegir qué hojas subir.</p>
            ${S.puedeEditar() ? '<input type="file" id="fileIni" accept=".xlsx">' : '<button class="btn btn-primary btn-sm" data-entrar>🔒 Entrar para cargar</button>'}</section>
        </div>
        <section class="card"><div class="card-head"><h2>Bitácora de cambios</h2></div><div id="bitFilters"></div><div id="bitBox"></div></section>`;
      U.$('#btnBase', c).onclick = descargarBase;
      const fIni = U.$('#fileIni', c); if (fIni) fIni.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaInicial(f); };
      const fArt = U.$('#fileArt', c); if (fArt) fArt.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaArticulos(f); };
      const fTk = U.$('#fileTk', c); if (fTk) fTk.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaTickets(f); };
      const fPed = U.$('#filePed', c); if (fPed) fPed.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaPedidos(f); };
      U.$$('[data-entrar]', c).forEach((b) => b.onclick = () => APP.entrar('Para subir archivos al portal necesitas la contraseña.'));
      APP.filterBar(U.$('#bitFilters', c), [
        { k: 'usuario', label: 'Usuario', type: 'search', placeholder: 'Nombre' },
        { k: 'accion', label: 'Acción', options: () => ['ALTA', 'CAMBIO', 'BAJA', 'RESTAURAR'] },
        { k: 'q', label: 'Registro (ID) o campo', type: 'search', placeholder: 'Ej. 1520 o fecha_real_llegada' },
      ], bit, drawBitacora);
      const counts = await contar();
      const lbl = { sp_pedidos: 'Pedidos (claves)', sp_articulos: 'Artículos', sp_cat_tiempo_entrega: 'Cat. tiempos de entrega', sp_cat_tiempo_descarga: 'Cat. tiempos de descarga', sp_cat_dias_no_recepcion: 'Cat. días no recepción', sp_cat_dias_inhabiles: 'Cat. días inhábiles', sp_cat_listas: 'Listas', sp_bitacora: 'Movimientos en bitácora' };
      if (APP.current !== 'datos' || !U.$('#dbCounts', c)) return;
      U.$('#dbCounts', c).innerHTML = `<table class="grid compact"><tbody>${Object.entries(lbl).map(([k, l]) => `<tr><td>${l}</td><td class="num"><b>${counts[k] === null ? '<span class="error">sin acceso</span>' : U.fmtNum(counts[k])}</b></td></tr>`).join('')}</tbody></table>
        ${counts.sp_pedidos === null ? '<p class="error">No se pudo consultar la base. ¿Ya ejecutaste supabase/schema.sql?</p>' : counts.sp_pedidos === 0 ? '<p class="warn-box">La base está vacía: usa “Carga inicial”.</p>' : ''}`;
      try {
        const last = await API.select('sp_cargas', { filters: [['tipo', 'eq', 'ARTICULOS']], order: 'fecha.desc', limit: 1 });
        if (last[0] && U.$('#lastArt', c)) U.$('#lastArt', c).textContent = `Última actualización: ${U.fmtDateTime(last[0].fecha)} por ${last[0].usuario} (${U.fmtNum(last[0].registros)} artículos)`;
      } catch { /* sin datos */ }
      if (APP.current === 'datos') drawBitacora();
    },
    refresh() { APP.go(); },
  });
})();
