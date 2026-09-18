/* Valida las reglas de tickets (v1.3.0) contra el "REPORTE DE TICKETS 2026".
   Uso: node tests/tickets.test.js "REPORTE DE TICKETS 2026.xlsx" [YYYY-MM-DD]
   La fecha es el día en que el Excel recalculó sus fórmulas (TODAY()); por default 2026-09-18. */
global.JSZip = require('../assets/js/vendor/jszip.min.js');
global.SP_CONFIG = { METAS_TICKET: { asignacion_horas: 24 } };
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

  const cmp = { cot: [0, 0, []], compra: [0, 0, []], val: [0, 0, []], fuera: [0, 0, []], horas: [0, 0, []] };
  for (const p of pedidos) {
    const t = C.etapasTicket(p, HOY, hol, cats);
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
    if (typeof x.horas === 'number') check('horas', Math.round(x.horas * 1440), Math.round(t.horasAsignacion * 60));
  }
  const nombre = { cot: 'ALERTA COTIZACION', compra: 'ALERTA COMPRA', val: 'VALIDACION TIEMPO', fuera: 'DÍAS FUERA DE PLAZO', horas: 'TIEMPO DE ASIGNACION' };
  console.log(`Reporte de tickets · ${pedidos.length} renglones · hoy = ${HOY}\n`);
  let fails = 0;
  for (const k of Object.keys(cmp)) {
    const [ok, n, ej] = cmp[k];
    const pct = n ? (100 * ok / n).toFixed(1) : '—';
    console.log(`${nombre[k].padEnd(22)} ${String(ok).padStart(4)}/${String(n).padEnd(4)} = ${pct}%`);
    if (ej.length) { console.log('   diferencias:', ej.join(' | ')); }
    if (n && ok / n < 0.95) fails++;
  }
  // Fecha límite calculada con la categoría (no viene en el reporte: se revisa la regla con días fijos)
  const base = { modulo: 'TICKET', fecha_solicitud: '2026-07-13', categoria_ticket: 'LICENCIAS Y SOFTWARE' };
  const lim = C.fechaLimiteCotizacion(base, cats, hol);
  console.log(`\nFecha límite (solicitud 13/07 + 3 días hábiles de "Licencias y software") = ${lim} ${lim === '2026-07-16' ? 'OK' : 'ERROR'}`);
  if (lim !== '2026-07-16') fails++;
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
