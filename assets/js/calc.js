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

  /* ------------------ Horario laboral (v1.7.0) ------------------
     La jornada es de 8:00 a 13:30 y de 15:00 a 18:00 (8.5 horas) de lunes a viernes,
     sin los días inhábiles del catálogo. Todo el reloj de los tickets corre sobre este
     horario: un ticket levantado el viernes a las 17:00 solo consume 1 hora ese día y
     sigue contando el lunes a las 8:00. Se puede cambiar en config.js con HORARIO. */
  const hm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const dosD = (n) => String(n).padStart(2, '0');
  const enMin = (dt) => { const s = U.isoDateTime(dt); return s ? { dia: s.slice(0, 10), min: +s.slice(11, 13) * 60 + +s.slice(14, 16) } : null; };
  const armaDT = (dia, min) => `${dia}T${dosD(Math.floor(min / 60))}:${dosD(Math.round(min % 60))}:00`;
  const antes = (a, b) => a.dia < b.dia || (a.dia === b.dia && a.min < b.min);

  C.HORARIO = function () {
    const cfg = CFG().HORARIO || {};
    const tramos = (cfg.jornada || [['08:00', '13:30'], ['15:00', '18:00']])
      .map((t) => [hm(t[0]), hm(t[1])]).filter((t) => t[1] > t[0]).sort((a, b) => a[0] - b[0]);
    const minutos = tramos.reduce((s, t) => s + (t[1] - t[0]), 0);
    return { tramos, minutos, horas: minutos / 60, inicio: tramos.length ? tramos[0][0] : 0, fin: tramos.length ? tramos[tramos.length - 1][1] : 0 };
  };
  /** Horas laborales de un día completo (8.5 con el horario actual) */
  C.horasDia = () => C.HORARIO().horas;
  /** Días de cotización → horas hábiles */
  C.diasAHoras = (d) => (d === null || d === undefined || isNaN(d)) ? null : Number(d) * C.horasDia();

  /** Primer instante hábil a partir de una fecha/hora (si ya es hábil, la misma) */
  C.inicioHabil = function (dt, hol) {
    const p = enMin(dt); if (!p) return null;
    const { tramos } = C.HORARIO();
    let dia = p.dia, min = p.min, g = 0;
    while (g++ < 1000) {
      if (U.isBusiness(dia, hol)) {
        for (const [a, b] of tramos) { if (min <= a) return armaDT(dia, a); if (min < b) return armaDT(dia, min); }
      }
      dia = U.addDays(dia, 1); min = 0;
    }
    return null;
  };
  /** Fin del horario del día (18:00): sirve para las fechas capturadas sin hora */
  C.finDelDia = (dia) => `${U.iso(dia)}T${dosD(Math.floor(C.HORARIO().fin / 60))}:${dosD(C.HORARIO().fin % 60)}:00`;

  /** Horas hábiles transcurridas entre dos fechas/horas (negativo si van al revés) */
  C.horasHabiles = function (a, b, hol) {
    const pa = enMin(a), pb = enMin(b); if (!pa || !pb) return null;
    if (antes(pb, pa)) { const r = C.horasHabiles(b, a, hol); return r === null ? null : -r; }
    const { tramos } = C.HORARIO();
    let min = 0, dia = pa.dia, g = 0;
    while (dia <= pb.dia && g++ < 4000) {
      if (U.isBusiness(dia, hol)) {
        const desde = dia === pa.dia ? pa.min : 0;
        const hasta = dia === pb.dia ? pb.min : 1440;
        for (const [x, y] of tramos) min += Math.max(0, Math.min(y, hasta) - Math.max(x, desde));
      }
      dia = U.addDays(dia, 1);
    }
    return min / 60;
  };
  /** Fecha/hora resultante de sumar horas hábiles (el reloj arranca en el siguiente instante hábil) */
  C.sumaHorasHabiles = function (dt, horas, hol) {
    if (horas === null || horas === undefined || isNaN(horas)) return null;
    const ini = C.inicioHabil(dt, hol); if (!ini) return null;
    let resta = Math.round(Number(horas) * 60);
    if (resta <= 0) return ini;
    const { tramos } = C.HORARIO();
    const p = enMin(ini);
    let dia = p.dia, min = p.min, g = 0;
    while (g++ < 4000) {
      if (U.isBusiness(dia, hol)) {
        for (const [a, b] of tramos) {
          const desde = Math.max(a, min);
          if (desde >= b) continue;
          const disp = b - desde;
          if (resta <= disp) return armaDT(dia, desde + resta);
          resta -= disp;
        }
      }
      dia = U.addDays(dia, 1); min = 0;
    }
    return null;
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
  /* v1.7.0: las etapas 1 a 5 se miden en HORAS HÁBILES (8.5 h por día laboral).
     La etapa 6 (llegada del proveedor) y la vigencia de la cotización siguen en días. */
  C.METAS_TICKET = () => Object.assign({
    asignacion_horas: 8.5, cotizacion: 3, recotizacion_horas: 17, autorizacion_horas: 25.5,
    pago_horas: 17, entrega: 15, vigencia: 15, avisar_vence: 3,
  }, CFG().METAS_TICKET || {});
  C.ETAPAS_TICKET = [
    { k: 'asignacion', n: 1, label: 'Asignación', quien: 'Jefe de área', desc: 'Del ticket levantado a la asignación del comprador', unidad: 'h' },
    { k: 'cotizacion', n: 2, label: 'Cotización', quien: 'Comprador', desc: 'De la asignación a la entrega de la cotización al usuario', unidad: 'h' },
    { k: 'recotizacion', n: 3, label: 'Recotización', quien: 'Comprador', desc: 'Solo si la cotización vence sin autorización del usuario', unidad: 'h' },
    { k: 'autorizacion', n: 4, label: 'Autorización', quien: 'Usuario', desc: 'De la cotización entregada a la autorización de compra', unidad: 'h' },
    { k: 'pago', n: 5, label: 'Pago', quien: 'Administración', desc: 'De la autorización de compra al pago del proveedor', unidad: 'h' },
    { k: 'entrega', n: 6, label: 'Llegada', quien: 'Proveedor', desc: 'Del pago a la llegada del artículo a SANVER', unidad: 'd' },
  ];
  C.ETAPA_LABEL = Object.fromEntries(C.ETAPAS_TICKET.map((e) => [e.k, e.label]));
  C.ETAPAS_FLUJO_TICKET = ['POR ASIGNAR', 'EN COTIZACIÓN', 'ESPERA DEL USUARIO', 'POR RECOTIZAR', 'POR PAGAR', 'EN SURTIMIENTO', 'ENTREGADO'];
  C.ALERTAS_TICKET = ['EN TIEMPO', 'POR VENCER', 'VENCE HOY', 'FUERA DEL PLAZO', 'FINALIZADO', 'SIN FECHA LIMITE', 'SIN AUTORIZACION DE COMPRA', 'SIN FECHA ESTIMADA', 'CANCELADO'];

  /** Días hábiles transcurridos entre dos fechas (mismo día = 0) */
  C.diasHabiles = (a, b, hol) => (!a || !b) ? null : Math.max(0, U.networkdays(a, b, hol) - 1);
  /** Horas corridas entre dos fechas/horas (reloj de pared, como la fórmula del Excel) */
  C.horasCorridas = function (a, b) {
    const x = U.isoDateTime(a), y = U.isoDateTime(b);
    if (!x || !y) return null;
    return (new Date(y.replace(' ', 'T')) - new Date(x.replace(' ', 'T'))) / 3600000;
  };
  /** Horas HÁBILES entre la solicitud y la asignación del ticket (v1.7.0) */
  C.tiempoAsignacionHoras = function (p, hol) {
    const a = U.isoDateTime(p.fecha_solicitud), b = U.isoDateTime(p.fecha_asignacion);
    if (!a || !b) return null;
    return C.horasHabiles(a, b, hol);
  };
  C.textoHoras = function (h) {
    if (h === null || h === undefined || isNaN(h)) return '';
    const neg = h < 0, t = Math.abs(h), hh = Math.floor(t), mm = Math.round((t - hh) * 60);
    return `${neg ? '-' : ''}${mm === 60 ? hh + 1 : hh}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
  };
  /** VALIDACION TIEMPO del reporte (se revisa con el reloj de pared, no con el horario) */
  C.validacionTiempo = function (p) {
    const h = C.horasCorridas(p.fecha_solicitud, p.fecha_asignacion);
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
  /** Horas hábiles de cotización que le tocan al ticket según su categoría */
  C.horasCotizacion = function (p, cats) {
    const d = C.diasCategoria(p.categoria_ticket, cats);
    return d === null || isNaN(d) ? null : C.diasAHoras(d);
  };
  /**
   * FECHA Y HORA LÍMITE DE COTIZACIÓN (v1.7.0)
   * = solicitud + (días de la categoría × 8.5) horas hábiles, sobre el horario de 8:00-13:30
   *   y 15:00-18:00 de lunes a viernes. Si se capturó a mano una fecha límite, esa manda
   *   (y se entiende como el cierre de ese día).
   */
  C.fechaLimiteCotizacion = function (p, cats, hol) {
    const cap = U.iso(p.fecha_limite_cotizacion);
    if (cap) { const dt = U.isoDateTime(p.fecha_limite_cotizacion); return dt && dt.slice(11) !== '00:00:00' ? dt : C.finDelDia(cap); }
    const fs = U.isoDateTime(p.fecha_solicitud); if (!fs) return null;
    const h = C.horasCotizacion(p, cats);
    return h === null ? null : C.sumaHorasHabiles(fs, h, hol);
  };
  /** Horas hábiles que faltan (o sobran, en negativo) para la fecha límite de cotización */
  C.restanteCotizacion = function (p, cats, hol, ahora) {
    if (C.cancelado(p) || U.iso(p.fecha_cotizacion_usuario)) return null;
    const lim = C.fechaLimiteCotizacion(p, cats, hol); if (!lim) return null;
    return C.horasHabiles(ahora || U.isoDateTime(new Date()), lim, hol);
  };
  /** ALERTA COTIZACION: ahora contra la fecha y hora límite */
  C.alertaCotizacionTicket = function (p, hoy, cats, hol, ahora) {
    if (C.cancelado(p)) return 'CANCELADO';
    const lim = C.fechaLimiteCotizacion(p, cats, hol);
    if (!lim) return 'SIN FECHA LIMITE';
    const dLim = U.iso(lim);
    const ent = U.iso(p.fecha_cotizacion_usuario);
    if (ent) {
      const entDT = U.isoDateTime(p.fecha_cotizacion_usuario);
      // Si la entrega se capturó sin hora se comparan solo las fechas (no se castiga la falta de hora)
      const tarde = entDT && entDT.slice(11) !== '00:00:00' ? entDT > lim : ent > dLim;
      return tarde ? 'FUERA DEL PLAZO' : 'FINALIZADO';
    }
    const now = ahora || U.isoDateTime(new Date());
    if (now > lim) return 'FUERA DEL PLAZO';
    if (dLim === (hoy || U.iso(now))) return 'VENCE HOY';
    const faltan = C.horasHabiles(now, lim, hol);
    return faltan !== null && faltan <= C.horasDia() ? 'POR VENCER' : 'EN TIEMPO';
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
  C.etapasTicket = function (p, hoy, hol, cats, ahora) {
    const metas = C.METAS_TICKET();
    const now = ahora || U.isoDateTime(new Date());
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
    // Metas en horas hábiles (la cotización, según los días de su categoría)
    const metaCot = C.horasCotizacion(p, cats) ?? C.diasAHoras(metas.cotizacion);
    const horas = C.tiempoAsignacionHoras(p, hol);
    // Los extremos de cada etapa se manejan con fecha y hora; las fechas sin hora arrancan al abrir (8:00)
    const dtSol = U.isoDateTime(p.fecha_solicitud), dtAsig = U.isoDateTime(p.fecha_asignacion);
    const tramos = [
      { k: 'asignacion', ini: solicitud, fin: asign, dtIni: dtSol, dtFin: dtAsig, meta: metas.asignacion_horas },
      { k: 'cotizacion', ini: asign || solicitud, fin: cot, dtIni: dtAsig || dtSol, meta: metaCot },
      { k: 'recotizacion', ini: recotizaActiva ? vence : null, fin: recot, meta: metas.recotizacion_horas },
      { k: 'autorizacion', ini: recot || cot, fin: aut, meta: metas.autorizacion_horas },
      { k: 'pago', ini: aut, fin: pago, meta: metas.pago_horas },
      { k: 'entrega', ini: pago || aut, fin: llegada, meta: metas.entrega },
    ];
    const etapas = tramos.map((t) => {
      const def = C.ETAPAS_TICKET.find((e) => e.k === t.k);
      const enHoras = def.unidad === 'h';
      const ini = t.dtIni || (t.ini ? U.isoDateTime(t.ini) : null);
      const fin = t.dtFin || (t.fin ? U.isoDateTime(t.fin) : null);
      let estado, dias = null;
      if (cancelado && !t.fin) estado = 'CANCELADA';
      else if (t.fin && t.ini) { estado = 'HECHA'; dias = enHoras ? Math.max(0, C.horasHabiles(ini, fin, hol)) : C.diasHabiles(t.ini, t.fin, hol); }
      else if (t.ini) {
        estado = 'EN CURSO';
        dias = enHoras ? Math.max(0, C.horasHabiles(ini, now, hol)) : C.diasHabiles(t.ini, hoy, hol);
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
      alertaCotizacion: C.alertaCotizacionTicket(p, hoy, cats, hol, now),
      restanteCotizacion: C.restanteCotizacion(p, cats, hol, now),
      horasCotizacion: metaCot, limiteCalculado: !U.iso(p.fecha_limite_cotizacion),
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
  C.enriquecer = function (p, hoy, hol, cats, ahora) {
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
      const t = C.etapasTicket(p, hoy, hol, cats, ahora);
      p._etapas = t; p._etapa = t.actual; p._vence_en = t.venceEn;
      p._alerta_cotizacion = t.alertaCotizacion; p._alerta_compra = t.alertaCompra;
      p._horas_asignacion = t.horasAsignacion; p._validacion_tiempo = t.validacion;
      p._dias_fuera_plazo = t.diasFuera; p._limite_cotizacion = t.limite; p._restante_cotizacion = t.restanteCotizacion;
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
