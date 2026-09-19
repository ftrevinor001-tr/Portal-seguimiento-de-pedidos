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
  /** v1.5.1 — El calendario cuenta la clave el día de su fecha estimada de llegada (fin de la ventana) */
  C.llegaEnDia = (p, iso) => U.iso(p.fecha_estimada) === iso && !C.cancelado(p) && !U.iso(p.fecha_real_llegada);
  /** Criterio anterior (se conserva para comparar con la app de Sheets): la ventana [inicio, fin] toca el día */
  C.enVentana = function (p, iso) {
    const v = C.ventana(p);
    return !!v.fin && v.ini <= iso && v.fin >= iso && !C.cancelado(p) && !U.iso(p.fecha_real_llegada);
  };
  /** Claves cuya fecha estimada de llegada cae en el mes */
  C.llegaEnMes = function (p, anio, mes) {
    const f = U.iso(p.fecha_estimada);
    return !!f && f.slice(0, 7) === `${anio}-${String(mes).padStart(2, '0')}`;
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

  /* ------------------ Etapas del TICKET (v1.3.0) ------------------ */
  /* Réplica del "REPORTE DE TICKETS 2026":
     1 Asignación   solicitud (fecha+hora) → asignación (fecha+hora)   [horas]
     2 Cotización   asignación → entrega de la cotización al usuario, contra la FECHA LÍMITE
                    (= solicitud + los días hábiles de la categoría, catálogo T.E. COTIZACIONES)
     3 Recotización INACTIVA; se activa si la cotización entregada vence sin autorización de compra
     4 Autorización entrega de la cotización → autorización de compra (usuario)
     5 Pago         autorización → pago al proveedor
     6 Llegada      pago (o autorización) → llegada real, contra la fecha estimada de llegada   */
  C.METAS_TICKET = () => Object.assign({
    asignacion_horas: 24, cotizacion: 3, recotizacion: 2, autorizacion: 3, pago: 2, entrega: 15,
    vigencia: 15, avisar_vence: 3,
  }, CFG().METAS_TICKET || {});
  C.ETAPAS_TICKET = [
    { k: 'asignacion', n: 1, label: 'Asignación', quien: 'Jefe de área', desc: 'Del ticket levantado a la asignación del comprador', unidad: 'h' },
    { k: 'cotizacion', n: 2, label: 'Cotización', quien: 'Comprador', desc: 'De la asignación a la entrega de la cotización al usuario', unidad: 'd' },
    { k: 'recotizacion', n: 3, label: 'Recotización', quien: 'Comprador', desc: 'Solo si la cotización vence sin autorización del usuario', unidad: 'd' },
    { k: 'autorizacion', n: 4, label: 'Autorización', quien: 'Usuario', desc: 'De la cotización entregada a la autorización de compra', unidad: 'd' },
    { k: 'pago', n: 5, label: 'Pago', quien: 'Administración', desc: 'De la autorización de compra al pago del proveedor', unidad: 'd' },
    { k: 'entrega', n: 6, label: 'Llegada', quien: 'Proveedor', desc: 'Del pago a la llegada del artículo a SANVER', unidad: 'd' },
  ];
  C.ETAPA_LABEL = Object.fromEntries(C.ETAPAS_TICKET.map((e) => [e.k, e.label]));
  C.ETAPAS_FLUJO_TICKET = ['POR ASIGNAR', 'EN COTIZACIÓN', 'ESPERA DEL USUARIO', 'POR RECOTIZAR', 'POR PAGAR', 'EN SURTIMIENTO', 'ENTREGADO'];
  C.ALERTAS_TICKET = ['EN TIEMPO', 'POR VENCER', 'VENCE HOY', 'FUERA DEL PLAZO', 'FINALIZADO', 'SIN FECHA LIMITE', 'SIN AUTORIZACION DE COMPRA', 'SIN FECHA ESTIMADA', 'CANCELADO'];

  /** Días hábiles transcurridos entre dos fechas (mismo día = 0) */
  C.diasHabiles = (a, b, hol) => (!a || !b) ? null : Math.max(0, U.networkdays(a, b, hol) - 1);
  /** Horas transcurridas entre solicitud y asignación (como la fórmula del reporte) */
  C.tiempoAsignacionHoras = function (p) {
    const a = U.isoDateTime(p.fecha_solicitud), b = U.isoDateTime(p.fecha_asignacion);
    if (!a || !b) return null;
    return (new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / 3600000;
  };
  C.textoHoras = function (h) {
    if (h === null || h === undefined || isNaN(h)) return '';
    const neg = h < 0, t = Math.abs(h), hh = Math.floor(t), mm = Math.round((t - hh) * 60);
    return `${neg ? '-' : ''}${mm === 60 ? hh + 1 : hh}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
  };
  /** VALIDACION TIEMPO del reporte */
  C.validacionTiempo = function (p) {
    const h = C.tiempoAsignacionHoras(p);
    if (h === null) return 'PENDIENTE DE ASIGNACION';
    return h < 0 ? 'REVISAR FECHA/HORA' : 'OK';
  };
  /** Días de cotización de una categoría (catálogo T.E. COTIZACIONES) */
  C.diasCategoria = function (categoria, cats) {
    const c = up(categoria);
    if (!c || !cats) return null;
    const hit = (cats || []).find((x) => up(x.categoria) === c && x.activo !== false);
    return hit ? Number(hit.dias) : null;
  };
  /** FECHA FINAL COTIZACIÓN = fecha de solicitud + días hábiles de la categoría */
  C.fechaLimiteCotizacion = function (p, cats, hol) {
    const cap = U.iso(p.fecha_limite_cotizacion); if (cap) return cap;
    const fs = U.iso(p.fecha_solicitud); if (!fs) return null;
    const d = C.diasCategoria(p.categoria_ticket, cats);
    return d === null || isNaN(d) ? null : U.addWorkdays(fs, d, hol);
  };
  /** ALERTA COTIZACION (misma lógica del Excel) */
  C.alertaCotizacionTicket = function (p, hoy, cats, hol) {
    if (C.cancelado(p)) return 'CANCELADO';
    const lim = C.fechaLimiteCotizacion(p, cats, hol);
    if (!lim) return 'SIN FECHA LIMITE';
    const ent = U.iso(p.fecha_cotizacion_usuario);
    if (ent) return ent > lim ? 'FUERA DEL PLAZO' : 'FINALIZADO';
    if (hoy > lim) return 'FUERA DEL PLAZO';
    if (hoy === lim) return 'VENCE HOY';
    return U.diffDays(lim, hoy) === 1 ? 'POR VENCER' : 'EN TIEMPO';
  };
  /** ALERTA COMPRA (misma lógica del Excel) */
  C.alertaCompraTicket = function (p, hoy) {
    if (C.cancelado(p)) return 'CANCELADO';
    if (!U.iso(p.fecha_autorizacion_compra)) return 'SIN AUTORIZACION DE COMPRA';
    const est = U.iso(p.fecha_estimada);
    if (!est) return 'SIN FECHA ESTIMADA';
    const real = U.iso(p.fecha_real_llegada);
    if (real) return real > est ? 'FUERA DEL PLAZO' : 'FINALIZADO';
    if (hoy > est) return 'FUERA DEL PLAZO';
    if (hoy === est) return 'VENCE HOY';
    return U.diffDays(est, hoy) === 1 ? 'POR VENCER' : 'EN TIEMPO';
  };
  /** DÍAS FUERA DE PLAZO (naturales, contra la fecha estimada de llegada) */
  C.diasFueraPlazoTicket = function (p, hoy) {
    const est = U.iso(p.fecha_estimada); if (!est) return null;
    const real = U.iso(p.fecha_real_llegada);
    return Math.max(0, U.diffDays(real || hoy, est));
  };
  /**
   * Vencimiento de la cotización entregada (vigencia en días naturales).
   * Solo aplica si se capturó la vigencia o la fecha de vencimiento: sin ese dato el ticket
   * no "vence" solo (así los tickets históricos no se marcan como POR RECOTIZAR).
   */
  C.venceCotizacion = function (fecha, dias, capturado) {
    const cap = U.iso(capturado); if (cap) return cap;
    const f = U.iso(fecha); if (!f) return null;
    if (dias === null || dias === undefined || dias === '' || isNaN(dias)) return null;
    return U.addDays(f, Number(dias));
  };
  /**
   * Etapas del ticket. Devuelve { etapas, actual, alertaCotizacion, alertaCompra, limite, vence, venceEn,
   * recotizaActiva, horasAsignacion, diasFuera, validacion, total }
   */
  C.etapasTicket = function (p, hoy, hol, cats) {
    const metas = C.METAS_TICKET();
    const solicitud = U.iso(p.fecha_solicitud), asign = U.iso(p.fecha_asignacion);
    const cot = U.iso(p.fecha_cotizacion_usuario), recot = U.iso(p.fecha_recotizacion_usuario);
    const aut = U.iso(p.fecha_autorizacion_compra), pago = U.iso(p.fecha_pago_proveedor);
    const llegada = U.iso(p.fecha_real_llegada), est = U.iso(p.fecha_estimada);
    const limite = C.fechaLimiteCotizacion(p, cats, hol);
    const vence = cot ? C.venceCotizacion(cot, p.vigencia_dias, p.fecha_vence_cotizacion) : null;
    const vence2 = recot ? C.venceCotizacion(recot, p.vigencia_dias_2, p.fecha_vence_cotizacion_2) : null;
    const cancelado = C.cancelado(p);
    // La etapa 3 solo se activa si la cotización venció sin autorización de compra
    const recotizaActiva = !aut && !!vence && (vence < hoy || !!recot);
    const metaCot = C.diasCategoria(p.categoria_ticket, cats) ?? metas.cotizacion;
    const horas = C.tiempoAsignacionHoras(p);
    const tramos = [
      { k: 'asignacion', ini: solicitud, fin: asign, horas: true, meta: metas.asignacion_horas },
      { k: 'cotizacion', ini: asign || solicitud, fin: cot, meta: metaCot },
      { k: 'recotizacion', ini: recotizaActiva ? vence : null, fin: recot, meta: metas.recotizacion },
      { k: 'autorizacion', ini: recot || cot, fin: aut, meta: metas.autorizacion },
      { k: 'pago', ini: aut, fin: pago, meta: metas.pago },
      { k: 'entrega', ini: pago || aut, fin: llegada, meta: metas.entrega },
    ];
    const etapas = tramos.map((t) => {
      const def = C.ETAPAS_TICKET.find((e) => e.k === t.k);
      let estado, dias = null;
      if (cancelado && !t.fin) estado = 'CANCELADA';
      else if (t.fin && t.ini) { estado = 'HECHA'; dias = t.horas ? horas : C.diasHabiles(t.ini, t.fin, hol); }
      else if (t.ini) {
        estado = 'EN CURSO';
        dias = t.horas ? Math.max(0, (Date.now() - new Date(String(U.isoDateTime(p.fecha_solicitud) || t.ini).replace(' ', 'T'))) / 3600000) : C.diasHabiles(t.ini, hoy, hol);
      }
      else estado = t.k === 'recotizacion' && !recotizaActiva ? 'INACTIVA' : 'PENDIENTE';
      const cumple = dias === null ? null : dias <= t.meta;
      return { ...def, ini: t.ini, fin: t.fin, dias, meta: t.meta, estado, cumple, enCurso: estado === 'EN CURSO' };
    });
    let actual;
    if (cancelado) actual = 'CANCELADO';
    else if (llegada) actual = 'ENTREGADO';
    else if (pago) actual = 'EN SURTIMIENTO';
    else if (aut) actual = 'POR PAGAR';
    else if (recotizaActiva && !recot) actual = 'POR RECOTIZAR';
    else if (recot || cot) actual = 'ESPERA DEL USUARIO';
    else if (asign) actual = 'EN COTIZACIÓN';
    else actual = 'POR ASIGNAR';
    const vig = recot ? vence2 : vence;
    const venceEn = vig && !aut && !llegada && !cancelado ? U.diffDays(vig, hoy) : null;
    const hechas = etapas.filter((e) => e.estado === 'HECHA');
    return {
      etapas, actual, limite, vence, vence2, vigente: vig, venceEn, recotizaActiva,
      alertaCotizacion: C.alertaCotizacionTicket(p, hoy, cats, hol),
      alertaCompra: C.alertaCompraTicket(p, hoy),
      horasAsignacion: horas, validacion: C.validacionTiempo(p),
      diasFuera: C.diasFueraPlazoTicket(p, hoy), estimada: est,
      total: C.diasHabiles(solicitud, llegada || hoy, hol),
      dias: Object.fromEntries(etapas.map((e) => [e.k, e.dias])),
      cumpleTodas: hechas.length ? hechas.every((e) => e.cumple) : null,
    };
  };
  /** true si el ticket necesita recotizarse (venció y el usuario no autorizó) */
  C.requiereRecotizar = (p, hoy, hol, cats) => p.modulo === 'TICKET' && C.etapasTicket(p, hoy, hol, cats).actual === 'POR RECOTIZAR';

  /** Agrega los campos calculados (prefijo _) a un pedido */
  C.enriquecer = function (p, hoy, hol, cats) {
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
    if (p.modulo === 'TICKET') {
      const t = C.etapasTicket(p, hoy, hol, cats);
      p._etapas = t; p._etapa = t.actual; p._vence_en = t.venceEn;
      p._alerta_cotizacion = t.alertaCotizacion; p._alerta_compra = t.alertaCompra;
      p._horas_asignacion = t.horasAsignacion; p._validacion_tiempo = t.validacion;
      p._dias_fuera_plazo = t.diasFuera; p._limite_cotizacion = t.limite;
      p._dias_asignacion = t.dias.asignacion; p._dias_cotizacion = t.dias.cotizacion;
      p._dias_recotizacion = t.dias.recotizacion; p._dias_autorizacion = t.dias.autorizacion;
      p._dias_pago = t.dias.pago; p._dias_etapa_entrega = t.dias.entrega;
    }
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
