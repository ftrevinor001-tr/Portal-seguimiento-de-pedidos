/* Reglas de negocio. Funciones puras: reciben un pedido (fila de sp_v_pedidos) y devuelven el valor calculado.
   Validadas contra el Excel original (ver docs/reglas-de-calculo.md). */
(function (root) {
  const U = root.U || require('./util.js');
  const CFG = () => (root.SP_CONFIG || {});
  const C = {};

  C.MODULOS = [
    { value: 'SOBREPEDIDO', label: 'Sobrepedido / Pedido especial' },
    { value: 'ENTREGA_DIRECTA', label: 'Entregas directas' },
    { value: 'TICKET', label: 'Tickets' },
  ];
  C.MODULO_LABEL = { SOBREPEDIDO: 'Sobrepedido', ENTREGA_DIRECTA: 'Entrega directa', TICKET: 'Ticket' };
  C.TIPOS_SOLICITUD = ['ENTREGA DIRECTA', 'SOBREPEDIDO', 'PEDIDO ESPECIAL', 'ESPECIAL', 'SUCURSAL ENTREGA DIRECTA', 'TICKET'];
  C.moduloDeTipo = (tipo) => tipo === 'ENTREGA DIRECTA' ? 'ENTREGA_DIRECTA' : tipo === 'TICKET' ? 'TICKET' : 'SOBREPEDIDO';
  C.STATUS = { SOBREPEDIDO: ['PENDIENTE', 'FINALIZADO', 'CANCELADO'], ENTREGA_DIRECTA: ['PENDIENTE', 'ENTREGADO', 'CANCELADO'], TICKET: ['PENDIENTE', 'ENTREGADO', 'CANCELADO'] };
  C.CLASIF_POLITICA = ['SOBREPEDIDO - VENTA REAL', 'SOBREPEDIDO - USO INTERNO', 'PEDIDO ESPECIAL - DESARROLLADOR', 'PEDIDO ESPECIAL - GERENCIA DE VENTAS'];
  C.ALERTAS = ['FUERA DEL PLAZO', 'NOTIFICAR', 'DENTRO DEL PLAZO', 'FINALIZADO', 'CANCELADO', 'SIN FECHA'];

  const up = (v) => U.norm(v);
  C.cancelado = (p) => up(p.status_pedido) === 'CANCELADO';

  /** Texto "DE 10 A 15 DIAS HABILES" -> {ini:10, fin:15, tipo:'HABILES'|null} */
  C.parseTiempoEntrega = function (t) {
    if (U.blank(t)) return { ini: null, fin: null, tipo: null };
    const s = up(t).replace(/1O/g, '10');
    const tipo = s.includes('HABIL') ? 'HABILES' : (s.includes('NATURAL') ? 'NATURALES' : null);
    let m = s.match(/(\d+)\s*(?:A|-|AL)\s*(\d+)/);
    if (m) return { ini: +m[1], fin: +m[2], tipo };
    m = s.match(/(\d+)/);
    if (m) return { ini: +m[1], fin: +m[1], tipo };
    return { ini: null, fin: null, tipo };
  };
  C.textoTiempoEntrega = (ini, fin, tipo) => (ini === null || ini === undefined || ini === '') ? '' :
    `DE ${ini} A ${fin ?? ini} DIAS${tipo === 'HABILES' ? ' HABILES' : ''}`;

  /** Suma días naturales o hábiles (L-V sin inhábiles) a la fecha de solicitud */
  C.sumarDias = function (fechaSolicitud, dias, tipo, hol) {
    const fs = U.iso(fechaSolicitud);
    if (!fs || dias === null || dias === undefined || dias === '' || isNaN(dias)) return null;
    return tipo === 'HABILES' ? U.addWorkdays(fs, Number(dias), hol) : U.addDays(fs, Number(dias));
  };
  /** Fechas estimadas propuestas. SOBREPEDIDO solo usa la fecha fin. */
  C.fechasEstimadas = function (p, hol) {
    return {
      inicio: p.modulo === 'SOBREPEDIDO' ? null : C.sumarDias(p.fecha_solicitud, p.dias_inicio, p.tipo_dias, hol),
      fin: C.sumarDias(p.fecha_solicitud, p.dias_fin, p.tipo_dias, hol),
    };
  };

  /** Status que corresponde a "ya llegó" según el módulo */
  C.statusLlegada = (modulo) => modulo === 'SOBREPEDIDO' ? 'FINALIZADO' : 'ENTREGADO';
  /**
   * Mantiene STATUS DEL PEDIDO alineado con FECHA REAL DE LLEGADA cuando el usuario solo cambia la fecha:
   * - se captura fecha real y el status es PENDIENTE  -> FINALIZADO / ENTREGADO
   * - se borra la fecha real y el status es FINALIZADO / ENTREGADO -> PENDIENTE
   * Si el usuario también cambia el status a mano, se respeta lo que eligió. CANCELADO nunca se toca.
   */
  C.ajustarStatusPorLlegada = function (prev, patch) {
    if (!prev || !('fecha_real_llegada' in patch) || 'status_pedido' in patch) return patch;
    const st = up(prev.status_pedido);
    if (patch.fecha_real_llegada && st === 'PENDIENTE') return { ...patch, status_pedido: C.statusLlegada(prev.modulo) };
    if (!patch.fecha_real_llegada && (st === 'FINALIZADO' || st === 'ENTREGADO')) return { ...patch, status_pedido: 'PENDIENTE' };
    return patch;
  };
  /** Revisión de consistencia entre status y fecha real */
  C.inconsistencia = function (p) {
    const st = up(p.status_pedido), real = U.iso(p.fecha_real_llegada);
    if (!real && (st === 'FINALIZADO' || st === 'ENTREGADO')) return 'STATUS_SIN_FECHA';
    if (real && st === 'PENDIENTE') return 'PENDIENTE_CON_FECHA';
    return '';
  };

  /** Compradores asignados a una clave en el maestro ("A | B" -> ['A','B']) */
  C.compradoresDeClave = (txt) => U.blank(txt) ? [] : U.uniq(String(txt).split('|').map((x) => up(x)));
  /**
   * v1.0.3 — Asignación NO restrictiva del comprador en "Nuevo pedido".
   * modo MANUAL: todas las claves con el comprador general.
   * modo CLAVES: cada clave con su comprador (sugerido del maestro y editable); si está vacío, el general.
   */
  C.MODOS_COMPRADOR = ['CLAVES', 'MANUAL'];
  C.compradorDeLinea = (l, modo, general) => (modo === 'MANUAL' ? up(general) : (up(l.comprador) || up(general))) || '';
  C.resumenCompradores = function (lineas, modo, general) {
    const conteo = new Map(), sinComprador = [], difiereMaestro = [];
    for (const l of lineas) {
      const c = C.compradorDeLinea(l, modo, general);
      if (!c) { sinComprador.push(l.clave || '(sin clave)'); continue; }
      conteo.set(c, (conteo.get(c) || 0) + 1);
      if (l.compradores && l.compradores.length && !l.compradores.includes(c)) difiereMaestro.push({ clave: l.clave, maestro: l.compradores, asignado: c });
    }
    return { compradores: [...conteo.entries()].map(([comprador, claves]) => ({ comprador, claves })), sinComprador, difiereMaestro };
  };

  /** ALERTA — réplica de la fórmula matricial del Excel (validada 100%) */
  C.alerta = function (p, hoy) {
    const est = U.iso(p.fecha_estimada), real = U.iso(p.fecha_real_llegada);
    if (!est) return C.cancelado(p) ? 'CANCELADO' : 'SIN FECHA';
    if (C.cancelado(p)) return 'CANCELADO';
    if (real) return real <= est ? 'FINALIZADO' : 'FUERA DEL PLAZO';
    if (est < hoy) return 'FUERA DEL PLAZO';
    if (U.diffDays(est, hoy) < (CFG().DIAS_NOTIFICAR ?? 5)) return 'NOTIFICAR';
    return 'DENTRO DEL PLAZO';
  };

  /** Días hábiles de retraso (NETWORKDAYS de fecha estimada a hoy). CERRADO si ya llegó. */
  C.diasIncumplimiento = function (p, hoy, hol) {
    if (C.cancelado(p)) return '';
    if (U.iso(p.fecha_real_llegada)) return 'CERRADO';
    const est = U.iso(p.fecha_estimada);
    if (!est || est >= hoy) return '';
    return U.networkdays(est, hoy, hol);
  };
  C.diasNaturales = (p) => { const fs = U.iso(p.fecha_solicitud), est = U.iso(p.fecha_estimada); return fs && est ? U.diffDays(est, fs) : null; };
  C.diasEntregaReal = (p) => { const fs = U.iso(p.fecha_solicitud), r = U.iso(p.fecha_real_llegada); return fs && r ? U.diffDays(r, fs) : null; };

  C.inv = function (p) {
    const e = p.existencia;
    if (e === null || e === undefined || e === '') return '';
    if (Number(e) > 0) { const c = String(p.clave || ''); return (/^\d+$/.test(c) || up(c) === 'NUEVO') ? 'CON INV' : 'SIN INV'; }
    return 'SIN INV';
  };
  C.estatusFacturacion = function (p) {
    const a = up(p.estatus_facturacion);
    if (a === 'CANCELADO' || a === 'TERMINADO') return a;
    return U.iso(p.fecha_facturacion) ? 'TERMINADO' : 'PENDIENTE';
  };
  C.clasificacion = (p) => `${p.tipo_solicitud || ''}-${p.area || ''}`;
  C.costoTotal = function (p) {
    if (p.costo_total !== null && p.costo_total !== undefined && p.costo_total !== '') return Number(p.costo_total);
    if (p.costo_unitario !== null && p.costo_unitario !== undefined && p.costo_unitario !== '' && p.cantidad_solicitada) return Number(p.costo_unitario) * Number(p.cantidad_solicitada);
    return null;
  };
  C.pctMinimo = (p) => (C.costoTotal(p) || 0) > (CFG().MONTO_PAGO_PARCIAL ?? 200000) ? (CFG().PCT_PAGO_PARCIAL ?? 0.7) : 1;
  C.cumplePolitica = function (p) {
    if (up(p.validacion_clasificacion) !== 'SOBREPEDIDO - VENTA REAL') return 'NO APLICA';
    const ok = up(p.cuenta_cotizacion) === 'SI' && up(p.factura_emitida_cliente) === 'SI' && Number(p.pct_pagado || 0) >= C.pctMinimo(p);
    return ok ? 'CUMPLE' : 'PENDIENTE';
  };

  /** Ventana de llegada [inicio, fin]; sin inicio se usa la fecha estimada */
  C.ventana = (p) => { const fin = U.iso(p.fecha_estimada); return { ini: U.iso(p.fecha_estimada_inicio) || fin, fin }; };
  C.traslapaMes = function (p, anio, mes) {
    const v = C.ventana(p); if (!v.fin) return false;
    return v.ini <= U.monthEnd(anio, mes) && v.fin >= U.monthStart(anio, mes);
  };
  C.mesSolicitud = function (p) {
    const fs = U.iso(p.fecha_solicitud);
    if (p.anio && p.mes && U.MESES.includes(up(p.mes))) return { anio: Number(p.anio), mes: U.MESES.indexOf(up(p.mes)) + 1 };
    if (fs) return { anio: +fs.slice(0, 4), mes: +fs.slice(5, 7) };
    return null;
  };

  /** Clasificación de cumplimiento por clave (reporte Compradores / mensual) */
  C.cumplimiento = function (p, hoy) {
    if (C.cancelado(p)) return 'CANCELADO';
    const est = U.iso(p.fecha_estimada), real = U.iso(p.fecha_real_llegada);
    if (!est) return 'SIN_FECHA';
    if (real) return real <= est ? 'DENTRO' : 'FUERA';
    return est < hoy ? 'PEND_VENCIDA' : 'PEND_EN_PLAZO';
  };

  /** Agrega los campos calculados (prefijo _) a un pedido */
  C.enriquecer = function (p, hoy, hol) {
    p._alerta = C.alerta(p, hoy);
    p._incumplimiento = C.diasIncumplimiento(p, hoy, hol);
    p._dias_naturales = C.diasNaturales(p);
    p._dias_entrega = C.diasEntregaReal(p);
    p._inv = C.inv(p);
    p._estatus_fact = C.estatusFacturacion(p);
    p._clasificacion = C.clasificacion(p);
    p._pct_minimo = C.pctMinimo(p);
    p._cumple_politica = C.cumplePolitica(p);
    p._costo_total = C.costoTotal(p);
    p._cumplimiento = C.cumplimiento(p, hoy);
    return p;
  };

  /** Resumen de cumplimiento para una lista de claves */
  C.resumenCumplimiento = function (rows) {
    const r = { claves: rows.length, DENTRO: 0, FUERA: 0, PEND_VENCIDA: 0, PEND_EN_PLAZO: 0, CANCELADO: 0, SIN_FECHA: 0, diasEntrega: [] };
    for (const p of rows) { r[p._cumplimiento]++; if (p._dias_entrega !== null && p._cumplimiento !== 'CANCELADO') r.diasEntrega.push(p._dias_entrega); }
    const base = r.DENTRO + r.FUERA + r.PEND_VENCIDA;
    r.base = base;
    r.pctDentro = base ? r.DENTRO / base : null;
    r.pctFuera = base ? r.FUERA / base : null;
    r.pctVencida = base ? r.PEND_VENCIDA / base : null;
    r.promDias = r.diasEntrega.length ? U.sum(r.diasEntrega) / r.diasEntrega.length : null;
    r.folios = new Set(rows.map((p) => p.folio_pedido).filter(Boolean)).size;
    return r;
  };

  /** Carga del calendario de Entregas Directas para un día */
  C.nivelCarga = function (horas) {
    const cap = CFG().CAPACIDAD_HORAS_DIA || 8;
    if (!horas) return 'SIN';
    const r = horas / cap;
    if (r >= (CFG().UMBRAL_CARGA_ALTA ?? 1)) return 'ALTA';
    if (r >= (CFG().UMBRAL_CARGA_MEDIA ?? 0.5)) return 'MEDIA';
    return 'BAJA';
  };
  /** Horas por folio = máximo tiempo de descarga capturado en sus claves */
  C.horasFolios = function (rows) {
    const m = new Map();
    for (const p of rows) { const k = p.folio_pedido || `#${p.id}`; m.set(k, Math.max(m.get(k) || 0, Number(p.tiempo_descarga_horas) || 0)); }
    return m;
  };
  C.proveedorDe = (p) => p.proveedor || p.marca || 'SIN PROVEEDOR';

  root.C = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
