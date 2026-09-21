/* Valida las reglas de tickets (v1.3.0) contra el "REPORTE DE TICKETS 2026".
   Uso: node tests/tickets.test.js "REPORTE DE TICKETS 2026.xlsx" [YYYY-MM-DD]
   La fecha es el día en que el Excel recalculó sus fórmulas (TODAY()); por default 2026-09-18. */
global.JSZip = require('../assets/js/vendor/jszip.min.js');
global.SP_CONFIG = {};
const U = require('../assets/js/util.js'); global.U = U;
const C = require('../assets/js/calc.js');
const XL = require('../assets/js/xlsx-lite.js');
const fs = require('fs');

const HOY = process.argv[3] || '2026-09-18';
const limpia = (v) => U.blank(v) ? '' : U.norm(String(v).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, '')).replace(/\s+/g, ' ');
const horaTexto = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') { const m = Math.round(v * 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
const conHora = (f, h) => { const d = U.iso(f); if (!d) return null; const t = horaTexto(h); return t ? `${d}T${t}:00` : d; };

(async () => {
  const wb = await XL.read(fs.readFileSync(process.argv[2]));
  const { rows } = XL.toObjects(await wb.rows('BASE DE DATOS'));
  const cats = XL.toObjects(await wb.rows('T.E. COTIZACIONES')).rows
    .map((o) => ({ categoria: U.norm(o['Categoría'] || o['CATEGORIA']), dias: Number(o['Días de cotización'] || o['DIAS DE COTIZACION']) }))
    .filter((c) => c.categoria);
  const hol = new Set();

  const pedidos = rows.filter((o) => !U.blank(o.TICKET)).map((o) => ({
    modulo: 'TICKET', folio_pedido: String(o.TICKET), status_pedido: U.norm(o['STATUS DEL TICKET']),
    fecha_solicitud: conHora(o['FECHA DE SOLICITUD'], o['HORA DE SOLICITUD']),
    fecha_asignacion: conHora(o['FECHA ASIGNACION'], o['HORA DE ASIGNACION']),
    fecha_limite_cotizacion: U.isoEs(o['FECHA FINAL COTIZACIÓN']),
    fecha_cotizacion_usuario: U.isoEs(o['FECHA ENTREGA COTIZACIÓN']),
    fecha_autorizacion_compra: U.isoEs(o['FECHA AUTORIZACIÓN COMPRA']),
    fecha_pago_proveedor: U.isoEs(o['FECHA PAGO PROVEEDOR']),
    fecha_estimada: U.isoEs(o['FECHA ESTIMADA DE LLEGADA COMPRA']),
    fecha_real_llegada: U.isoEs(o['FECHA REAL DE LLEGADA']),
    _xls: {
      cot: limpia(o['ALERTA COTIZACION']), compra: limpia(o['ALERTA COMPRA '] ?? o['ALERTA COMPRA']),
      val: limpia(o['VALIDACION TIEMPO']), fuera: o['DÍAS FUERA DE PLAZO'], horas: o['TIEMPO DE ASIGNACION'],
    },
  }));

  const cmp = { cot: [0, 0, []], compra: [0, 0, []], val: [0, 0, []], fuera: [0, 0, []] };
  // v1.7.0: el tiempo de asignación pasó a HORAS HÁBILES, así que ya no coincide con el reloj
  // de pared del Excel. Se revisa que nunca sea mayor y se reporta cuánto baja.
  const has = { n: 0, menor: 0, sumaXls: 0, sumaApp: 0, meta: 0, ej: [] };
  const AHORA = `${HOY}T12:00:00`;
  for (const p of pedidos) {
    const t = C.etapasTicket(p, HOY, hol, cats, AHORA);
    const x = p._xls;
    const check = (k, esperado, obtenido) => {
      if (esperado === '' || esperado === null || esperado === undefined) return;
      cmp[k][1]++;
      if (String(esperado) === String(obtenido)) cmp[k][0]++;
      else if (cmp[k][2].length < 6) cmp[k][2].push(`${p.folio_pedido}: Excel="${esperado}" app="${obtenido}"`);
    };
    check('cot', x.cot, t.alertaCotizacion);
    check('compra', x.compra, t.alertaCompra);
    check('val', x.val, t.validacion);
    if (x.fuera !== null && x.fuera !== undefined && x.fuera !== '') check('fuera', Number(x.fuera), t.diasFuera);
    if (typeof x.horas === 'number' && t.horasAsignacion !== null) {
      const xls = x.horas * 24, app = t.horasAsignacion;
      has.n++; has.sumaXls += xls; has.sumaApp += app;
      if (app <= xls + 0.001) has.menor++;
      else if (has.ej.length < 6) has.ej.push(`${p.folio_pedido}: corridas=${xls.toFixed(1)} hábiles=${app.toFixed(1)}`);
      if (app <= C.METAS_TICKET().asignacion_horas) has.meta++;
    }
  }
  const nombre = { cot: 'ALERTA COTIZACION', compra: 'ALERTA COMPRA', val: 'VALIDACION TIEMPO', fuera: 'DÍAS FUERA DE PLAZO' };
  console.log(`Reporte de tickets · ${pedidos.length} renglones · hoy = ${HOY}\n`);
  let fails = 0;
  for (const k of Object.keys(cmp)) {
    const [ok, n, ej] = cmp[k];
    const pct = n ? (100 * ok / n).toFixed(1) : '—';
    console.log(`${nombre[k].padEnd(22)} ${String(ok).padStart(4)}/${String(n).padEnd(4)} = ${pct}%`);
    if (ej.length) { console.log('   diferencias:', ej.join(' | ')); }
    if (n && ok / n < 0.95) fails++;
  }
  // Tiempo de asignación: horas hábiles contra las horas corridas del Excel (v1.7.0)
  console.log(`\nTIEMPO DE ASIGNACION · ${has.n} tickets medidos`);
  console.log(`   promedio Excel (horas corridas) ${(has.sumaXls / has.n).toFixed(1)} h → app (horas hábiles) ${(has.sumaApp / has.n).toFixed(1)} h`);
  console.log(`   nunca mayor que el reloj de pared: ${has.menor}/${has.n} ${has.menor === has.n ? 'OK' : 'ERROR'}`);
  if (has.ej.length) console.log('   casos raros:', has.ej.join(' | '));
  console.log(`   dentro de la meta de ${C.METAS_TICKET().asignacion_horas} h hábiles: ${has.meta}/${has.n} = ${(100 * has.meta / has.n).toFixed(1)}%`);
  if (has.menor !== has.n) fails++;

  // Fecha y hora límite calculada con la categoría (no viene en el reporte)
  const base = { modulo: 'TICKET', fecha_solicitud: '2026-07-13', categoria_ticket: 'LICENCIAS Y SOFTWARE' };
  const lim = C.fechaLimiteCotizacion(base, cats, hol);
  const esperado = '2026-07-15T18:00:00'; // lunes 13/07 8:00 + 25.5 h hábiles (3 días × 8.5)
  console.log(`\nLímite de cotización (solicitud 13/07 + 3 días de "Licencias y software" = 25.5 h hábiles) = ${lim} ${lim === esperado ? 'OK' : `ERROR, esperado ${esperado}`}`);
  if (lim !== esperado) fails++;
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
