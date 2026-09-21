/* Pruebas del horario laboral de los tickets (v1.7.0).
   Jornada 8:00-13:30 y 15:00-18:00 = 8.5 h, de lunes a viernes, sin días inhábiles.
   Uso: node tests/horario.test.js */
global.SP_CONFIG = {};
const U = require('../assets/js/util.js'); global.U = U;
const C = require('../assets/js/calc.js');

let fails = 0, checks = 0;
const eq = (name, got, exp) => {
  checks++;
  if (String(got) !== String(exp)) { fails++; console.log(`✗ ${name}\n    esperado ${exp}\n    obtenido ${got}`); }
};
// 16/09/2026 (miércoles) es día inhábil de prueba; 2026-09-21 es lunes
const hol = new Set(['2026-09-16']);

console.log('1) Jornada');
eq('horas por día', C.horasDia(), 8.5);
eq('3 días de cotización = horas', C.diasAHoras(3), 25.5);

console.log('2) Suma de horas hábiles (fecha límite)');
// El caso que pidió el área de compras: viernes 17:00 + 1 día laboral
eq('viernes 18/09 17:00 + 8.5 h → lunes 17:00', C.sumaHorasHabiles('2026-09-18T17:00:00', 8.5, hol), '2026-09-21T17:00:00');
eq('lunes 08:00 + 25.5 h (3 días) → miércoles 18:00', C.sumaHorasHabiles('2026-09-21T08:00:00', 25.5, hol), '2026-09-23T18:00:00');
eq('lunes 08:00 + 8.5 h → lunes 18:00 (cierre)', C.sumaHorasHabiles('2026-09-21T08:00:00', 8.5, hol), '2026-09-21T18:00:00');
eq('martes 13:00 + 1 h → 15:30 (salta la comida)', C.sumaHorasHabiles('2026-09-22T13:00:00', 1, hol), '2026-09-22T15:30:00');
eq('sábado 10:00 + 1 h → lunes 09:00', C.sumaHorasHabiles('2026-09-19T10:00:00', 1, hol), '2026-09-21T09:00:00');
eq('domingo 20/09 + 0 h → lunes 08:00', C.sumaHorasHabiles('2026-09-20T23:00:00', 0, hol), '2026-09-21T08:00:00');
eq('martes 15/09 17:00 + 8.5 h con 16/09 inhábil → jueves 17:00', C.sumaHorasHabiles('2026-09-15T17:00:00', 8.5, hol), '2026-09-17T17:00:00');
eq('antes de abrir: lunes 06:00 + 2 h → lunes 10:00', C.sumaHorasHabiles('2026-09-21T06:00:00', 2, hol), '2026-09-21T10:00:00');
eq('después de cerrar: lunes 19:00 + 2 h → martes 10:00', C.sumaHorasHabiles('2026-09-21T19:00:00', 2, hol), '2026-09-22T10:00:00');
eq('5 días (42.5 h) desde lunes 08:00 → viernes 18:00', C.sumaHorasHabiles('2026-09-21T08:00:00', 42.5, hol), '2026-09-25T18:00:00');

console.log('3) Horas hábiles transcurridas');
eq('viernes 17:00 → lunes 09:00 = 2 h', C.horasHabiles('2026-09-18T17:00:00', '2026-09-21T09:00:00', hol), 2);
eq('día completo 08:00 → 18:00 = 8.5 h', C.horasHabiles('2026-09-21T08:00:00', '2026-09-21T18:00:00', hol), 8.5);
eq('12:00 → 16:00 = 2.5 h (hora y media + una hora)', C.horasHabiles('2026-09-21T12:00:00', '2026-09-21T16:00:00', hol), 2.5);
eq('fin de semana completo = 0 h', C.horasHabiles('2026-09-19T08:00:00', '2026-09-20T23:00:00', hol), 0);
eq('semana lunes 08:00 → viernes 18:00 = 42.5 h', C.horasHabiles('2026-09-21T08:00:00', '2026-09-25T18:00:00', hol), 42.5);
eq('con día inhábil 15/09 08:00 → 17/09 08:00 = 8.5 h', C.horasHabiles('2026-09-15T08:00:00', '2026-09-17T08:00:00', hol), 8.5);
eq('al revés da negativo', C.horasHabiles('2026-09-21T10:00:00', '2026-09-21T08:00:00', hol), -2);
eq('ida y vuelta: suma y resta coinciden', C.horasHabiles('2026-09-18T17:00:00', C.sumaHorasHabiles('2026-09-18T17:00:00', 8.5, hol), hol), 8.5);

console.log('4) Fecha y hora límite de cotización del ticket');
const cats = [{ categoria: 'LICENCIAS Y SOFTWARE', dias: 3 }, { categoria: 'HERRAMIENTA', dias: 5 }];
const tk = (extra) => Object.assign({ modulo: 'TICKET', status_pedido: 'PENDIENTE' }, extra);
// 1 h el viernes + lunes y martes completos (17 h) + miércoles 7.5 h (5.5 antes de comer y 2 después)
eq('solicitud viernes 17:00 + 3 días (25.5 h) → miércoles 17:00',
  C.fechaLimiteCotizacion(tk({ fecha_solicitud: '2026-09-18T17:00:00', categoria_ticket: 'LICENCIAS Y SOFTWARE' }), cats, hol), '2026-09-23T17:00:00');
eq('solicitud lunes 08:00 + 5 días → viernes 18:00',
  C.fechaLimiteCotizacion(tk({ fecha_solicitud: '2026-09-21T08:00:00', categoria_ticket: 'HERRAMIENTA' }), cats, hol), '2026-09-25T18:00:00');
eq('sin categoría no hay fecha límite',
  C.fechaLimiteCotizacion(tk({ fecha_solicitud: '2026-09-21T08:00:00' }), cats, hol), 'null');
eq('la fecha capturada a mano manda (cierre del día)',
  C.fechaLimiteCotizacion(tk({ fecha_solicitud: '2026-09-21T08:00:00', categoria_ticket: 'HERRAMIENTA', fecha_limite_cotizacion: '2026-09-22' }), cats, hol), '2026-09-22T18:00:00');

console.log('5) Alerta de cotización contra la hora');
const base = { fecha_solicitud: '2026-09-21T08:00:00', categoria_ticket: 'LICENCIAS Y SOFTWARE' }; // límite: miércoles 23/09 18:00
const al = (p, ahora) => C.alertaCotizacionTicket(tk(Object.assign({}, base, p)), U.iso(ahora), cats, hol, ahora);
eq('lunes 09:00 → EN TIEMPO', al({}, '2026-09-21T09:00:00'), 'EN TIEMPO');
eq('martes 17:00 (quedan 9.5 h) → EN TIEMPO', al({}, '2026-09-22T17:00:00'), 'EN TIEMPO');
eq('martes 18:30, ya cerrado (quedan 8.5 h) → POR VENCER', al({}, '2026-09-22T18:30:00'), 'POR VENCER');
eq('miércoles 09:00 (mismo día del límite) → VENCE HOY', al({}, '2026-09-23T09:00:00'), 'VENCE HOY');
eq('miércoles 18:30 (ya cerró) → FUERA DEL PLAZO', al({}, '2026-09-23T18:30:00'), 'FUERA DEL PLAZO');
eq('entregada el martes → FINALIZADO', al({ fecha_cotizacion_usuario: '2026-09-22' }, '2026-09-24T09:00:00'), 'FINALIZADO');
eq('entregada el jueves → FUERA DEL PLAZO', al({ fecha_cotizacion_usuario: '2026-09-24' }, '2026-09-24T09:00:00'), 'FUERA DEL PLAZO');
eq('cancelado → CANCELADO', C.alertaCotizacionTicket(tk(Object.assign({}, base, { status_pedido: 'CANCELADO' })), '2026-09-21', cats, hol, '2026-09-21T09:00:00'), 'CANCELADO');
eq('horas restantes el martes 17:00 (1 h hoy + 8.5 mañana)', C.restanteCotizacion(tk(base), cats, hol, '2026-09-22T17:00:00'), 9.5);

console.log('6) Etapas del ticket en horas hábiles');
const t = C.etapasTicket(tk({
  fecha_solicitud: '2026-09-18T17:00:00', fecha_asignacion: '2026-09-21T09:00:00',
  categoria_ticket: 'LICENCIAS Y SOFTWARE', fecha_cotizacion_usuario: '2026-09-22',
}), '2026-09-23', hol, cats, '2026-09-23T10:00:00');
const et = (k) => t.etapas.find((e) => e.k === k);
eq('1 asignación: viernes 17:00 → lunes 09:00 = 2 h', et('asignacion').dias, 2);
eq('1 asignación cumple la meta de 8.5 h', et('asignacion').cumple, true);
eq('meta de asignación', et('asignacion').meta, 8.5);
eq('2 cotización se mide en horas', et('cotizacion').unidad, 'h');
eq('2 cotización: lunes 09:00 → martes 08:00 = 7.5 h', et('cotizacion').dias, 7.5);
eq('meta de cotización = 3 días × 8.5', et('cotizacion').meta, 25.5);
eq('6 llegada sigue en días', et('entrega').unidad, 'd');
eq('etapa actual', t.actual, 'ESPERA DEL USUARIO');
eq('alerta de cotización', t.alertaCotizacion, 'FINALIZADO');

console.log(`\n${checks - fails} de ${checks} verificaciones OK`);
process.exit(fails ? 1 : 0);
