/* Pruebas de reglas de negocio contra el Excel original y las pantallas de la app anterior.
   Uso: node tests/reglas.test.js ruta/carga_inicial.xlsx ruta/valid.json */
global.JSZip = require('../assets/js/vendor/jszip.min.js');
global.SP_CONFIG = { DIAS_NOTIFICAR: 5, CAPACIDAD_HORAS_DIA: 8, UMBRAL_CARGA_MEDIA: 0.5, UMBRAL_CARGA_ALTA: 1, MONTO_PAGO_PARCIAL: 200000, PCT_PAGO_PARCIAL: 0.7 };
const U = require('../assets/js/util.js'); global.U = U;
const C = require('../assets/js/calc.js');
const XL = require('../assets/js/xlsx-lite.js');
const fs = require('fs');
let fails = 0, checks = 0;
const eq = (name, got, exp) => { checks++; const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) { fails++; console.log(`✗ ${name}: esperado ${JSON.stringify(exp)} obtenido ${JSON.stringify(got)}`); } return ok; };

(async () => {
  const wb = await XL.read(fs.readFileSync(process.argv[2]));
  const P = XL.toObjects(await wb.rows('PEDIDOS')).rows;
  const ART = new Map(XL.toObjects(await wb.rows('ARTICULOS')).rows.map((a) => [String(a.clave), a.existencia]));
  let id = 1;
  P.forEach((p) => { p.id = id++; p.existencia = ART.has(String(p.clave)) ? ART.get(String(p.clave)) : null; C.enriquecer(p, '2026-09-10', new Set()); });
  const byOrigen = new Map(P.map((p) => [`${p.origen_hoja}|${p.origen_fila}`, p]));

  // 1) Reglas vs valores del Excel (mismo universo que el reporte de validación)
  const V = JSON.parse(fs.readFileSync(process.argv[3]));
  const res = {};
  for (const v of V) {
    const p = byOrigen.get(`${v.h}|${v.f}`); if (!p) continue;
    let js;
    switch (true) {
      // El Excel deja en blanco la alerta sin fecha estimada (aunque esté cancelada); la app muestra SIN FECHA / CANCELADO
      case v.v.startsWith('ALERTA'): js = (p._alerta === 'SIN FECHA' || (p._alerta === 'CANCELADO' && !p.fecha_estimada)) ? '' : p._alerta; break;
      case v.v === 'DIAS NATURALES': js = p._dias_naturales; break;
      case v.v.startsWith('ESTATUS FACTURACION'): js = p._estatus_fact; break;
      case v.v.startsWith('CLASIFICACION'): js = p._clasificacion; break;
      case v.v.startsWith('% PAGO'): js = p._pct_minimo; break;
      case v.v.startsWith('EXISTENCIA'): js = p.existencia === null ? '' : p.existencia; break;
      default: continue;
    }
    const norm = (x) => x === null || x === undefined ? '' : typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : String(x).trim().toUpperCase();
    const r = res[`${v.v} · ${v.h}`] = res[`${v.v} · ${v.h}`] || { n: 0, igualPython: 0, igualExcel: 0 };
    r.n++; if (norm(js) === norm(v.app)) r.igualPython++; if (norm(js) === norm(v.excel)) r.igualExcel++;
  }
  console.log('\n1) Reglas JS vs Python (validado) y vs Excel');
  for (const [k, r] of Object.entries(res)) { console.log(`   ${k}: ${r.n} filas · JS=Python ${r.igualPython} · JS=Excel ${r.igualExcel} (${(100 * r.igualExcel / r.n).toFixed(1)}%)`); eq(`${k} JS=Python`, r.igualPython, r.n); }

  // 2) Calendario Entregas Directas septiembre 2026 vs pantalla de la app anterior
  const ed = P.filter((p) => p.modulo === 'ENTREGA_DIRECTA');
  const mes = ed.filter((p) => C.traslapaMes(p, 2026, 9));
  const pantalla = { 1: [0, 0, 0], 2: [0, 0, 0], 3: [3, 2, 6], 4: [3, 2, 6], 5: [4, 2, 8], 7: [5, 3, 9], 8: [11, 4, 25], 9: [11, 4, 25], 10: [16, 6, 37], 11: [20, 7, 55], 12: [20, 6, 57.5], 14: [23, 4, 73], 15: [28, 7, 84.5], 16: [27, 7, 82.5], 17: [26, 6, 70.5], 18: [24, 3, 67.5], 19: [24, 3, 63], 21: [22, 3, 56], 22: [18, 2, 48], 23: [14, 2, 38.5], 24: [12, 2, 33], 25: [10, 2, 29], 26: [9, 2, 27], 28: [9, 2, 27], 29: [9, 2, 27], 30: [6, 2, 19.5] };
  console.log('\n2) Calendario sept-2026 (folios, proveedores, horas) vs pantalla anterior');
  let dOk = 0;
  for (const [d, exp] of Object.entries(pantalla)) {
    const iso = `2026-09-${String(d).padStart(2, '0')}`;
    const rows = mes.filter((p) => { const v = C.ventana(p); return v.ini <= iso && v.fin >= iso && !C.cancelado(p) && !U.iso(p.fecha_real_llegada); });
    const h = C.horasFolios(rows);
    const got = [h.size, new Set(rows.map(C.proveedorDe)).size, [...h.values()].reduce((a, b) => a + b, 0)];
    if (eq(`día ${d}`, got, exp)) dOk++; else console.log(`     nivel=${C.nivelCarga(got[2])}`);
  }
  console.log(`   ${dOk} de ${Object.keys(pantalla).length} días idénticos`);
  eq('nivel 6h', C.nivelCarga(6), 'MEDIA'); eq('nivel 8h', C.nivelCarga(8), 'ALTA'); eq('nivel 0', C.nivelCarga(0), 'SIN');
  const hm = C.horasFolios(mes); const noC = mes.filter((p) => !C.cancelado(p));
  console.log('   KPIs del mes:', { folios: hm.size, horas: [...hm.values()].reduce((a, b) => a + b, 0), proveedores: new Set(noC.map(C.proveedorDe)).size, pctEntregas: (100 * noC.filter((p) => p.fecha_real_llegada).length / noC.length).toFixed(1) });
  eq('Folios programados', hm.size, 107); eq('Horas mensuales', [...hm.values()].reduce((a, b) => a + b, 0), 237);
  eq('% de entregas', (100 * noC.filter((p) => p.fecha_real_llegada).length / noC.length).toFixed(1), '68.8');

  // 3) Compradores: ENTREGA DIRECTA sept-2026
  const rc = C.resumenCumplimiento(P.filter((p) => p.tipo_solicitud === 'ENTREGA DIRECTA' && C.traslapaMes(p, 2026, 9)));
  console.log('\n3) Compradores ED sept-2026:', { dentro: rc.DENTRO, fuera: rc.FUERA, pendVencidas: rc.PEND_VENCIDA, pendEnPlazo: rc.PEND_EN_PLAZO, canceladas: rc.CANCELADO });
  eq('Dentro del plazo', rc.DENTRO, 251); eq('Fuera', rc.FUERA, 0); eq('Pend. vencidas', rc.PEND_VENCIDA, 0);

  // 4) Fechas estimadas
  eq('hábiles', C.sumarDias('2026-04-10T09:00:00', 3, 'HABILES', new Set()), '2026-04-15');
  eq('naturales', C.sumarDias('2026-04-12T08:00:58', 25, 'NATURALES'), '2026-05-07');
  eq('parse', C.parseTiempoEntrega('DE 1O A 20 DIAS HABILES'), { ini: 10, fin: 20, tipo: 'HABILES' });
  eq('inhábil', C.sumarDias('2026-09-14', 2, 'HABILES', new Set(['2026-09-16'])), '2026-09-17');
  eq('incumplimiento', C.diasIncumplimiento({ fecha_estimada: '2026-09-07' }, '2026-09-10', new Set()), 4);
  eq('política', C.cumplePolitica({ validacion_clasificacion: 'SOBREPEDIDO - VENTA REAL', cuenta_cotizacion: 'SI', factura_emitida_cliente: 'SI', pct_pagado: 0.7, costo_total: 250000 }), 'CUMPLE');
  eq('política pend', C.cumplePolitica({ validacion_clasificacion: 'SOBREPEDIDO - VENTA REAL', cuenta_cotizacion: 'SI', factura_emitida_cliente: 'SI', pct_pagado: 0.7, costo_total: 150000 }), 'PENDIENTE');

  // 5) Status vs fecha real de llegada
  eq('fecha real -> FINALIZADO', C.ajustarStatusPorLlegada({ modulo: 'SOBREPEDIDO', status_pedido: 'PENDIENTE' }, { fecha_real_llegada: '2026-09-10' }).status_pedido, 'FINALIZADO');
  eq('fecha real -> ENTREGADO', C.ajustarStatusPorLlegada({ modulo: 'ENTREGA_DIRECTA', status_pedido: 'PENDIENTE' }, { fecha_real_llegada: '2026-09-10' }).status_pedido, 'ENTREGADO');
  eq('borrar fecha -> PENDIENTE', C.ajustarStatusPorLlegada({ modulo: 'SOBREPEDIDO', status_pedido: 'FINALIZADO' }, { fecha_real_llegada: null }).status_pedido, 'PENDIENTE');
  eq('cancelado no cambia', C.ajustarStatusPorLlegada({ modulo: 'SOBREPEDIDO', status_pedido: 'CANCELADO' }, { fecha_real_llegada: null }).status_pedido, undefined);
  eq('status manual se respeta', C.ajustarStatusPorLlegada({ modulo: 'SOBREPEDIDO', status_pedido: 'FINALIZADO' }, { fecha_real_llegada: null, status_pedido: 'CANCELADO' }).status_pedido, 'CANCELADO');
  eq('inconsistencia', C.inconsistencia({ status_pedido: 'FINALIZADO', fecha_real_llegada: null }), 'STATUS_SIN_FECHA');

  // 6) Comprador por clave
  eq('compradores de clave', C.compradoresDeClave('IVAN | myriam vida christell'), ['IVAN', 'MYRIAM VIDA CHRISTELL']);
  const ls = [{ clave: '26319', compradores: ['ARICELIA'], comprador: 'ARICELIA' }, { clave: '52461', compradores: ['ARICELIA'], comprador: 'SILVINO' }, { clave: 'NUEVO', compradores: [], comprador: '' }];
  eq('manual: todas con el general', ls.map((l) => C.compradorDeLinea(l, 'MANUAL', 'lucia')), ['LUCIA', 'LUCIA', 'LUCIA']);
  eq('claves: cada una la suya y general en vacías', ls.map((l) => C.compradorDeLinea(l, 'CLAVES', 'lucia')), ['ARICELIA', 'SILVINO', 'LUCIA']);
  const rsm = C.resumenCompradores(ls, 'CLAVES', '');
  eq('resumen compradores', rsm.compradores, [{ comprador: 'ARICELIA', claves: 1 }, { comprador: 'SILVINO', claves: 1 }]);
  eq('resumen sin comprador', rsm.sinComprador, ['NUEVO']);
  eq('distinto al maestro (solo aviso)', rsm.difiereMaestro.map((d) => d.clave), ['52461']);
  eq('manual distinto al maestro', C.resumenCompradores(ls, 'MANUAL', 'LUCIA').difiereMaestro.length, 2);
  eq('manual sin comprador', C.resumenCompradores(ls, 'MANUAL', '').sinComprador.length, 3);
  eq('clave con dos compradores', C.resumenCompradores([{ clave: '45852', compradores: ['IVAN', 'MYRIAM VIDA CHRISTELL'], comprador: 'MYRIAM VIDA CHRISTELL' }], 'CLAVES', '').difiereMaestro.length, 0);

  // 7) Etapas del ticket (v1.2.0) — días hábiles, vigencia y activación de la recotización
  const HOL = new Set();
  const base = { modulo: 'TICKET', status_pedido: 'PENDIENTE', fecha_solicitud: '2026-09-01', fecha_asignacion: '2026-09-02', fecha_cotizacion_usuario: '2026-09-04', vigencia_dias: 15 };
  const et = (p, hoy) => C.etapasTicket(p, hoy, HOL);
  let t = et(base, '2026-09-15');
  eq('etapa 1 asignación (días hábiles)', t.dias.asignacion, 1);
  eq('etapa 2 cotización', t.dias.cotizacion, 2);
  eq('vence la cotización', t.vence, '2026-09-19');
  eq('días para vencer', t.venceEn, 4);
  eq('etapa actual con cotización vigente', t.actual, 'ESPERA DEL USUARIO');
  eq('etapa 3 inactiva mientras no venza', t.etapas[2].estado, 'INACTIVA');
  eq('etapa 4 pendiente', t.etapas[3].estado, 'PENDIENTE');
  eq('cumple metas 1 y 2', [t.etapas[0].cumple, t.etapas[1].cumple], [true, true]);

  t = et(base, '2026-09-25');
  eq('venció sin respuesta → por recotizar', t.actual, 'POR RECOTIZAR');
  eq('etapa 3 se activa al vencer', t.etapas[2].estado, 'EN CURSO');
  eq('etapa 3 en curso desde el vencimiento', t.dias.recotizacion, 4);
  eq('etapa 3 fuera de meta', t.etapas[2].cumple, false);

  const conRecot = { ...base, fecha_recotizacion_usuario: '2026-09-23', vigencia_dias_2: 15 };
  t = et(conRecot, '2026-09-25');
  eq('etapa 3 medida', t.dias.recotizacion, 2);
  eq('etapa 3 dentro de meta', t.etapas[2].cumple, true);
  eq('vence la re-cotización', t.vence2, '2026-10-08');
  eq('tras recotizar, espera del usuario', t.actual, 'ESPERA DEL USUARIO');

  const aceptado = { ...conRecot, fecha_aceptacion_usuario: '2026-09-24' };
  eq('aceptada → en surtimiento', et(aceptado, '2026-09-30').actual, 'EN SURTIMIENTO');
  eq('etapa 3 ya no se activa si el usuario aceptó', et({ ...base, fecha_aceptacion_usuario: '2026-09-10' }, '2026-09-25').etapas[2].estado, 'INACTIVA');
  const entregado = { ...aceptado, fecha_real_llegada: '2026-10-08', status_pedido: 'ENTREGADO' };
  t = et(entregado, '2026-10-20');
  eq('etapa 4 entrega (días hábiles)', t.dias.entrega, 10);
  eq('etapa 4 dentro de meta 15', t.etapas[3].cumple, true);
  eq('ticket entregado', t.actual, 'ENTREGADO');
  eq('total del ticket', t.total, 27);
  eq('cancelado', et({ ...base, status_pedido: 'CANCELADO' }, '2026-09-25').actual, 'CANCELADO');
  eq('vencimiento capturado a mano manda', C.venceCotizacion('2026-09-04', 15, '2026-09-10'), '2026-09-10');
  eq('vigencia por default', C.venceCotizacion('2026-09-04', null, null), '2026-09-19');
  eq('días inhábiles cuentan', C.etapasTicket(base, '2026-09-15', new Set(['2026-09-02'])).dias.asignacion, 0);

  console.log(`\n${checks - fails} de ${checks} verificaciones OK`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
