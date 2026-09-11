/* Estado global de la app: datos cargados de Supabase, catálogos, usuario y operaciones de guardado */
(function (root) {
  const S = {
    pedidos: [],        // activos (vista sp_v_pedidos) + calculados
    bajas: null,        // dados de baja (se cargan bajo demanda)
    cat: { te: [], td: [], dnr: [], inh: [], listas: [] },
    hol: new Set(),
    hoy: U.today(),
    user: null,
    listeners: new Set(),
    cargado: false,
  };

  const LS_USER = 'sp_usuario';
  try { S.user = localStorage.getItem(LS_USER) || null; } catch { S.user = null; }
  S.setUser = (n) => { S.user = U.norm(n) || null; try { localStorage.setItem(LS_USER, S.user || ''); } catch { /* sin storage */ } S.emit('user'); };

  S.on = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
  S.emit = (what) => S.listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

  /* ------------------ Campos (definición central) ------------------ */
  // type: text | textarea | num | money | pct | date | datetime | select | bool ; list: nombre de lista ; mods: módulos donde aplica
  const ALL = ['SOBREPEDIDO', 'ENTREGA_DIRECTA', 'TICKET'];
  const SP = ['SOBREPEDIDO'], ED = ['ENTREGA_DIRECTA'], EDT = ['ENTREGA_DIRECTA', 'TICKET'];
  S.FIELDS = [
    { k: 'tipo_solicitud', label: 'Tipo de solicitud', type: 'select', list: 'TIPO_SOLICITUD', mods: ALL, sec: 'Solicitud' },
    { k: 'folio_pedido', label: 'Folio del pedido', type: 'text', mods: ALL, sec: 'Solicitud' },
    { k: 'id_oc', label: 'ID / OC', type: 'text', mods: ALL, sec: 'Solicitud' },
    { k: 'comprador', label: 'Comprador', type: 'select', list: 'COMPRADOR', mods: ALL, sec: 'Solicitud' },
    { k: 'area', label: 'Área', type: 'select', list: 'AREA', mods: ALL, sec: 'Solicitud' },
    { k: 'solicitante', label: 'Solicitante', type: 'text', list: 'SOLICITANTE', mods: ALL, sec: 'Solicitud' },
    { k: 'status_pedido', label: 'Status del pedido', type: 'select', list: 'STATUS', mods: ALL, sec: 'Solicitud' },
    { k: 'anio', label: 'Año', type: 'num', mods: ALL, sec: 'Solicitud' },
    { k: 'mes', label: 'Mes', type: 'select', list: 'MES', mods: ALL, sec: 'Solicitud' },

    { k: 'clave', label: 'Clave', type: 'text', mods: ALL, sec: 'Artículo' },
    { k: 'catalogado_nuevo', label: 'Catalogado o nuevo', type: 'select', list: 'CATALOGADO', mods: SP, sec: 'Artículo' },
    { k: 'descripcion', label: 'Descripción', type: 'textarea', mods: ALL, sec: 'Artículo' },
    { k: 'marca', label: 'Marca', type: 'text', list: 'MARCA', mods: ALL, sec: 'Artículo' },
    { k: 'unidad', label: 'Unidad', type: 'text', list: 'UNIDAD', mods: ALL, sec: 'Artículo' },
    { k: 'cantidad_solicitada', label: 'Cantidad solicitada', type: 'num', mods: ALL, sec: 'Artículo' },
    { k: 'proveedor', label: 'Proveedor', type: 'text', list: 'PROVEEDOR', mods: ALL, sec: 'Artículo' },
    { k: 'tipo_material', label: 'Tipo de material', type: 'text', list: 'TIPO_MATERIAL', mods: EDT, sec: 'Artículo' },

    { k: 'fecha_solicitud', label: 'Fecha de solicitud', type: 'datetime', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'tiempo_entrega', label: 'Tiempo de entrega (texto)', type: 'text', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'dias_inicio', label: 'Días A (inicio)', type: 'num', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'dias_fin', label: 'Días B (fin)', type: 'num', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'tipo_dias', label: 'Tipo de días', type: 'select', list: 'TIPO_DIAS', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'fecha_estimada_inicio', label: 'Fecha estimada inicio', type: 'date', mods: EDT, sec: 'Tiempos de entrega' },
    { k: 'fecha_estimada', label: 'Fecha estimada de llegada (fin)', type: 'date', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'fecha_estimada_manual', label: 'Fecha estimada capturada a mano', type: 'bool', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'te_especial_comprador', label: 'TE especial solicitado por comprador', type: 'date', mods: ED, sec: 'Tiempos de entrega' },
    { k: 'tiempo_descarga_horas', label: 'Tiempo de descarga (horas)', type: 'num', mods: EDT, sec: 'Tiempos de entrega' },
    { k: 'fecha_real_llegada', label: 'Fecha real de llegada', type: 'date', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'fecha_compromiso', label: 'Fecha compromiso', type: 'date', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'fecha_compromiso_nota', label: 'Nota de fecha compromiso', type: 'text', mods: ALL, sec: 'Tiempos de entrega' },
    { k: 'directo_sanver', label: 'Directo Sanver', type: 'select', list: 'DIRECTO_SANVER', mods: ED, sec: 'Tiempos de entrega' },
    { k: 'tipo_directo', label: 'Tipo directo', type: 'text', mods: EDT, sec: 'Tiempos de entrega' },
    { k: 'alerta_id_oc', label: 'Alerta ID (OC)', type: 'select', list: 'ALERTA_OC', mods: EDT, sec: 'Tiempos de entrega' },

    { k: 'folio_factura', label: 'Folio de factura', type: 'text', mods: ED, sec: 'Facturación' },
    { k: 'fecha_facturacion', label: 'Fecha de facturación', type: 'date', mods: ALL, sec: 'Facturación' },
    { k: 'estatus_facturacion', label: 'Estatus facturación (capturado)', type: 'select', list: 'ESTATUS_FACT', mods: ALL, sec: 'Facturación' },
    { k: 'fecha_facturacion_1', label: 'Fecha facturación 1ra entrega', type: 'date', mods: EDT, sec: 'Facturación' },
    { k: 'cantidad_entregada', label: 'Cantidad entregada 1ra', type: 'num', mods: EDT, sec: 'Facturación' },
    { k: 'fecha_facturacion_2', label: 'Fecha facturación 2da entrega', type: 'date', mods: EDT, sec: 'Facturación' },
    { k: 'cantidad_entregada_2', label: 'Cantidad entregada 2da', type: 'num', mods: EDT, sec: 'Facturación' },
    { k: 'validacion_telemarketing', label: 'Validación telemarketing', type: 'text', mods: EDT, sec: 'Facturación' },

    { k: 'validacion_clasificacion', label: 'Clasificación de política', type: 'select', list: 'CLASIF_POLITICA', mods: SP, sec: 'Política de documentación' },
    { k: 'cuenta_cotizacion', label: 'Cuenta con cotización', type: 'select', list: 'SINO', mods: SP, sec: 'Política de documentación' },
    { k: 'pct_pagado', label: '% pagado (comprobante)', type: 'pct', mods: SP, sec: 'Política de documentación' },
    { k: 'factura_emitida_cliente', label: 'Factura emitida al cliente', type: 'select', list: 'SINO', mods: SP, sec: 'Política de documentación' },
    { k: 'costo_unitario', label: 'Costo unitario (MXN)', type: 'money', mods: SP, sec: 'Política de documentación' },
    { k: 'costo_total', label: 'Costo total (MXN)', type: 'money', mods: SP, sec: 'Política de documentación' },

    { k: 'resultado_final', label: 'Resultado final / aviso', type: 'text', mods: ALL, sec: 'Comentarios' },
    { k: 'comentarios', label: 'Comentarios', type: 'textarea', mods: ALL, sec: 'Comentarios' },
    { k: 'observaciones', label: 'Observaciones', type: 'textarea', mods: ALL, sec: 'Comentarios' },
  ];
  S.FIELD = Object.fromEntries(S.FIELDS.map((f) => [f.k, f]));
  S.fieldsFor = (modulo) => S.FIELDS.filter((f) => f.mods.includes(modulo));

  /** Convierte un valor capturado al tipo de la base de datos */
  S.coerce = function (k, v) {
    const f = S.FIELD[k] || { type: 'text' };
    if (v === undefined) return undefined;
    if (f.type === 'bool') return !!v;
    if (U.blank(v)) return null;
    switch (f.type) {
      case 'num': case 'money': { const n = Number(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; }
      case 'pct': { const s = String(v).replace('%', '').trim(); let n = Number(s); if (isNaN(n)) return null; if (n > 1) n = n / 100; return n; }
      case 'date': return U.iso(v);
      case 'datetime': return U.isoDateTime(v);
      default: return String(v).trim();
    }
  };

  /* ------------------ Listas desplegables ------------------ */
  const FIXED = {
    TIPO_SOLICITUD: C.TIPOS_SOLICITUD, MES: U.MESES, CATALOGADO: ['CATALOGADO', 'NUEVO'], TIPO_DIAS: ['NATURALES', 'HABILES'],
    ESTATUS_FACT: ['PENDIENTE', 'TERMINADO', 'CANCELADO'], CLASIF_POLITICA: C.CLASIF_POLITICA, SINO: ['SI', 'NO'],
    DIRECTO_SANVER: ['DG', 'SUCURSAL'], ALERTA_OC: ['TERMINADO', 'FUERA DEL PLAZO', 'CANCELADO', 'DESABASTO'],
  };
  S.lista = function (name, modulo) {
    if (name === 'STATUS') return modulo ? C.STATUS[modulo] : U.uniq([...C.STATUS.SOBREPEDIDO, ...C.STATUS.ENTREGA_DIRECTA]);
    if (FIXED[name]) return FIXED[name];
    const vals = new Set();
    for (const l of S.cat.listas) if (l.activo !== false && l.lista === name && (!modulo || !l.modulo || l.modulo === modulo)) vals.add(l.valor);
    const map = { COMPRADOR: 'comprador', AREA: 'area', SOLICITANTE: 'solicitante', MARCA: 'marca', UNIDAD: 'unidad', PROVEEDOR: 'proveedor', TIPO_MATERIAL: 'tipo_material' };
    if (map[name]) for (const p of S.pedidos) if ((!modulo || p.modulo === modulo) && !U.blank(p[map[name]])) vals.add(p[map[name]]);
    if (name === 'PROVEEDOR') { S.cat.te.forEach((r) => r.activo !== false && vals.add(r.proveedor)); S.cat.td.forEach((r) => r.activo !== false && vals.add(r.proveedor)); }
    if (name === 'SOLICITANTE') S.cat.te.forEach((r) => r.activo !== false && vals.add(r.solicitante));
    if (name === 'TIPO_MATERIAL') S.cat.td.forEach((r) => r.activo !== false && r.tipo_material && vals.add(r.tipo_material));
    return U.sortEs([...vals]);
  };
  /** Usuarios sugeridos: compradores + los que ya han editado */
  S.usuarios = () => U.sortEs(U.uniq([...S.lista('COMPRADOR'), ...S.lista('USUARIO')]));

  /* ------------------ Carga de datos ------------------ */
  S.enrich = (p) => C.enriquecer(p, S.hoy, S.hol);
  S.refreshHol = () => { S.hol = new Set(S.cat.inh.filter((r) => r.activo !== false).map((r) => U.iso(r.fecha))); };

  S.loadCatalogos = async function () {
    const [te, td, dnr, inh, listas] = await Promise.all([
      API.selectAll('sp_cat_tiempo_entrega', { order: 'proveedor,solicitante,id' }),
      API.selectAll('sp_cat_tiempo_descarga', { order: 'proveedor,id' }),
      API.selectAll('sp_cat_dias_no_recepcion', { order: 'solicitante,id' }),
      API.selectAll('sp_cat_dias_inhabiles', { order: 'fecha' }),
      API.selectAll('sp_cat_listas', { order: 'lista,valor' }),
    ]);
    Object.assign(S.cat, { te, td, dnr, inh, listas });
    S.refreshHol();
  };
  S.loadAll = async function (onProgress) {
    S.hoy = U.today();
    await S.loadCatalogos();
    const rows = await API.selectAll('sp_v_pedidos', { filters: [['activo', 'eq', 'true']], order: 'id' }, onProgress);
    rows.forEach(S.enrich);
    S.pedidos = rows;
    S.bajas = null;
    S.cargado = true;
    S.emit('data');
  };
  S.loadBajas = async function () {
    const rows = await API.selectAll('sp_v_pedidos', { filters: [['activo', 'eq', 'false']], order: 'id' });
    rows.forEach(S.enrich);
    S.bajas = rows;
    return rows;
  };
  S.byId = (id) => S.pedidos.find((p) => p.id === id) || (S.bajas || []).find((p) => p.id === id);

  /* ------------------ Artículos (maestro) ------------------ */
  const artCache = new Map();
  S.articulos = async function (claves) {
    const need = U.uniq(claves.map((c) => String(c).trim())).filter((c) => !artCache.has(c));
    for (const part of U.chunk(need, 150)) {
      const rows = await API.select('sp_articulos', { select: 'clave,descripcion,marca,unidad,existencia,costo,estatus_compra', filters: [['clave', 'in', part]] });
      part.forEach((c) => artCache.set(c, null));
      rows.forEach((r) => artCache.set(r.clave, r));
    }
    const out = {}; claves.forEach((c) => { out[c] = artCache.get(String(c).trim()) || null; });
    return out;
  };
  S.clearArtCache = () => artCache.clear();

  /* ------------------ Guardado ------------------ */
  function requireUser() { if (!S.user) throw new Error('Selecciona tu nombre antes de guardar (arriba a la derecha).'); }
  const TABLE_COLS = new Set([...S.FIELDS.map((f) => f.k), 'modulo', 'activo', 'origen_hoja', 'origen_fila', 'creado_por', 'actualizado_por']);

  function replaceLocal(row, prevExistencia) {
    const idx = S.pedidos.findIndex((p) => p.id === row.id);
    const merged = S.enrich({ ...row, existencia: prevExistencia, art_descripcion: null });
    if (row.activo === false) { if (idx >= 0) S.pedidos.splice(idx, 1); if (S.bajas) { const j = S.bajas.findIndex((p) => p.id === row.id); if (j >= 0) S.bajas[j] = merged; else S.bajas.push(merged); } }
    else { if (idx >= 0) S.pedidos[idx] = merged; else S.pedidos.push(merged); if (S.bajas) S.bajas = S.bajas.filter((p) => p.id !== row.id); }
    return merged;
  }
  async function existenciaDe(clave) { if (U.blank(clave)) return null; const a = await S.articulos([clave]); return a[clave] ? a[clave].existencia : null; }

  /** Actualiza campos de un pedido (solo manda lo que cambió) */
  S.updatePedido = async function (id, patch) {
    requireUser();
    const prev = S.byId(id);
    patch = C.ajustarStatusPorLlegada(prev, patch);
    const clean = {};
    for (const [k, v] of Object.entries(patch)) if (TABLE_COLS.has(k)) clean[k] = v;
    clean.actualizado_por = S.user;
    const row = await API.updateById('sp_pedidos', id, clean);
    if (!row) throw new Error('No se encontró el registro (¿fue modificado por otra persona?). Actualiza la página.');
    const exi = ('clave' in clean && prev && clean.clave !== prev.clave) ? await existenciaDe(clean.clave) : (prev ? prev.existencia : null);
    const merged = replaceLocal(row, exi);
    S.emit('data');
    return merged;
  };
  /** Actualiza varios pedidos con el mismo cambio */
  S.updateMany = async function (ids, patch) {
    requireUser();
    const prevs = new Map(ids.map((id) => [id, S.byId(id)]));
    // El status puede quedar distinto por clave (según su status actual): se agrupan los cambios iguales
    const grupos = new Map();
    for (const id of ids) {
      const clean = { ...C.ajustarStatusPorLlegada(prevs.get(id), patch), actualizado_por: S.user };
      const key = JSON.stringify(clean);
      if (!grupos.has(key)) grupos.set(key, { clean, ids: [] });
      grupos.get(key).ids.push(id);
    }
    for (const g of grupos.values()) {
      for (const part of U.chunk(g.ids, 200)) {
        const rows = await API.update('sp_pedidos', [['id', 'in', part]], g.clean);
        rows.forEach((r) => replaceLocal(r, prevs.get(r.id) ? prevs.get(r.id).existencia : null));
      }
    }
    S.emit('data');
  };
  S.insertPedidos = async function (rows, onProgress) {
    requireUser();
    const clean = rows.map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) if (TABLE_COLS.has(k)) o[k] = v; o.creado_por = S.user; o.actualizado_por = S.user; return o; });
    const inserted = await API.insert('sp_pedidos', clean, { onProgress });
    const arts = await S.articulos(inserted.map((r) => r.clave).filter(Boolean));
    inserted.forEach((r) => replaceLocal(r, arts[r.clave] ? arts[r.clave].existencia : null));
    S.emit('data');
    return inserted;
  };
  S.bitacoraDe = (id) => API.select('sp_bitacora', { filters: [['tabla', 'eq', 'sp_pedidos'], ['registro_id', 'eq', id]], order: 'fecha.desc,id.desc', limit: 500 });

  /* Catálogos */
  S.CAT_TABLES = { te: 'sp_cat_tiempo_entrega', td: 'sp_cat_tiempo_descarga', dnr: 'sp_cat_dias_no_recepcion', inh: 'sp_cat_dias_inhabiles', listas: 'sp_cat_listas' };
  S.saveCat = async function (key, row) {
    requireUser();
    const table = S.CAT_TABLES[key];
    const data = { ...row }; delete data.id; delete data.actualizado_en; data.actualizado_por = S.user;
    let saved;
    if (row.id) saved = await API.updateById(table, row.id, data);
    else saved = (await API.insert(table, [data]))[0];
    const list = S.cat[key];
    const i = list.findIndex((r) => r.id === saved.id);
    if (i >= 0) list[i] = saved; else list.push(saved);
    if (key === 'inh') { S.refreshHol(); S.pedidos.forEach(S.enrich); }
    S.emit('cat');
    return saved;
  };

  /* Búsquedas en catálogos para captura */
  S.buscarTiempoEntrega = function (proveedor, solicitante) {
    const P = U.norm(proveedor), So = U.norm(solicitante);
    if (!P || !So) return null;
    return S.cat.te.find((r) => r.activo !== false && U.norm(r.proveedor) === P && U.norm(r.solicitante) === So) || null;
  };
  S.buscarTiempoDescarga = function (proveedor, tipoMaterial, marca) {
    const P = U.norm(proveedor), T = U.norm(tipoMaterial), M = U.norm(marca);
    const act = S.cat.td.filter((r) => r.activo !== false);
    return (P && T && act.find((r) => U.norm(r.proveedor) === P && U.norm(r.tipo_material) === T)) ||
      (P && act.find((r) => U.norm(r.proveedor) === P)) ||
      (M && act.find((r) => U.norm(r.marca) === M)) || null;
  };
  S.diaNoRecibe = function (solicitante) {
    const So = U.norm(solicitante);
    return S.cat.dnr.filter((r) => r.activo !== false && U.norm(r.solicitante) === So).map((r) => U.norm(r.dia));
  };

  root.S = S;
})(window);
