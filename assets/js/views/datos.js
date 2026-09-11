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
      if (!S.user) { APP.pickUser(true); return; }
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
      if (!S.user) { APP.pickUser(true); return; }
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
          <section class="card"><div class="card-head"><h2>Actualizar maestro de artículos</h2></div>
            <p class="muted">Sube la exportación del sistema (hoja con <b>IDARTICULO</b> y <b>EXIUNIBAS</b>, como la pestaña “E”) o un archivo con CLAVE y COMPRADOR (asignación de compradores). También acepta CSV con CLAVE, DESCRIPCION, MARCA, UNIDAD, EXISTENCIA, COSTO, COMPRADOR. Actualiza por clave solo las columnas que traiga.</p>
            <input type="file" id="fileArt" accept=".xlsx,.csv"><div id="lastArt" class="muted small"></div></section>
          <section class="card"><div class="card-head"><h2>Carga inicial</h2></div>
            <p class="muted">Solo la primera vez: sube <b>carga_inicial.xlsx</b> (datos ya limpios del Google Sheet). Puedes elegir qué hojas subir.</p>
            <input type="file" id="fileIni" accept=".xlsx"></section>
        </div>
        <section class="card"><div class="card-head"><h2>Bitácora de cambios</h2></div><div id="bitFilters"></div><div id="bitBox"></div></section>`;
      U.$('#btnBase', c).onclick = descargarBase;
      U.$('#fileIni', c).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaInicial(f); };
      U.$('#fileArt', c).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) cargaArticulos(f); };
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
